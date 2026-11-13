//! WendingAI 额度查询。
//!
//! - `GET {origin}/api/status`（公开，无需认证）读取 `quota_per_unit`（多少内部额度 = 1 个显示单位）
//!   和 `quota_display_type`（USD / CNY / TOKENS / CUSTOM）。拿不到时回落到 new-api 默认值 500000 / USD。
//! - `GET {origin}/api/usage/token/`（用 sk- Key 认证，只读）读取这把 Key 的已用 / 剩余额度；
//!   令牌允许查询用户额度时，响应里还会带 `user_quota`，一并显示为账户余额。
//!
//! 错误约定与 `balance.rs` 一致：瞬时网络错误返回 `Err`（前端重试并保留上次成功值），
//! 确定性失败（401/403、业务错误、解析失败）返回 `Ok(success: false)`。
//! 任何日志和错误信息都不包含 API Key 本身。

use std::time::Duration;

use crate::provider::{UsageData, UsageResult};

/// new-api 默认：500000 内部额度 = 1 USD
pub const DEFAULT_QUOTA_PER_UNIT: f64 = 500_000.0;

#[derive(Debug, Clone, PartialEq)]
pub struct QuotaDisplay {
    pub quota_per_unit: f64,
    pub unit: String,
}

impl Default for QuotaDisplay {
    fn default() -> Self {
        Self {
            quota_per_unit: DEFAULT_QUOTA_PER_UNIT,
            unit: "USD".to_string(),
        }
    }
}

/// 从 `/api/status` 的响应体解析额度换算规则
pub fn parse_status(body: &serde_json::Value) -> QuotaDisplay {
    let data = body.get("data").unwrap_or(body);
    let quota_per_unit = data
        .get("quota_per_unit")
        .and_then(|v| {
            v.as_f64()
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        })
        .filter(|v| *v > 0.0)
        .unwrap_or(DEFAULT_QUOTA_PER_UNIT);
    let display_type = data
        .get("quota_display_type")
        .and_then(|v| v.as_str())
        .unwrap_or("USD")
        .to_ascii_uppercase();
    let unit = match display_type.as_str() {
        "TOKENS" | "TOKEN" => "tokens".to_string(),
        "CNY" => "CNY".to_string(),
        _ => "USD".to_string(),
    };
    QuotaDisplay {
        quota_per_unit: if unit == "tokens" {
            1.0
        } else {
            quota_per_unit
        },
        unit,
    }
}

fn num(obj: &serde_json::Value, key: &str) -> Option<f64> {
    obj.get(key).and_then(|v| {
        v.as_f64()
            .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    })
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn error_result(msg: String) -> UsageResult {
    UsageResult {
        success: false,
        data: None,
        error: Some(msg),
    }
}

/// 解析 `/api/usage/token/` 的响应体
pub fn parse_token_usage(body: &serde_json::Value, display: &QuotaDisplay) -> UsageResult {
    let ok = body
        .get("code")
        .map(|c| c.as_bool().unwrap_or(false) || c.as_i64() == Some(0))
        .unwrap_or(false)
        || body
            .get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
    let Some(data) = body.get("data").filter(|d| d.is_object()) else {
        let msg = body
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unexpected response");
        return error_result(format!("WendingAI: {msg}"));
    };
    if !ok && body.get("code").is_some() {
        let msg = body
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Query failed");
        return error_result(format!("WendingAI: {msg}"));
    }

    let ratio = display.quota_per_unit;
    let unlimited = data
        .get("unlimited_quota")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let available = num(data, "total_available").unwrap_or(0.0);
    let used = num(data, "total_used").unwrap_or(0.0);
    let granted = num(data, "total_granted").unwrap_or(available + used);
    let expires_at = num(data, "expires_at").unwrap_or(0.0);
    let expired = expires_at > 0.0 && (expires_at as i64) < chrono::Utc::now().timestamp();

    let mut out = Vec::new();

    // 账户余额（令牌允许查询用户额度时才有）
    if let Some(user) = data.get("user_quota").filter(|u| u.is_object()) {
        let u_avail = num(user, "total_available").unwrap_or(0.0);
        let u_used = num(user, "total_used").unwrap_or(0.0);
        out.push(UsageData {
            plan_name: Some("account".to_string()),
            extra: None,
            is_valid: Some(true),
            invalid_message: None,
            total: Some(round2((u_avail + u_used) / ratio)),
            used: Some(round2(u_used / ratio)),
            remaining: Some(round2(u_avail / ratio)),
            unit: Some(display.unit.clone()),
        });
    }

    // 这把 Key 的额度
    out.push(UsageData {
        plan_name: Some("key".to_string()),
        extra: Some(
            serde_json::json!({
                "unlimited": unlimited,
                "expiresAt": if expires_at > 0.0 { Some(expires_at as i64) } else { None },
                "name": data.get("name").and_then(|v| v.as_str()),
            })
            .to_string(),
        ),
        is_valid: Some(!expired),
        invalid_message: if expired {
            Some("API key expired".to_string())
        } else {
            None
        },
        total: if unlimited {
            None
        } else {
            Some(round2(granted / ratio))
        },
        used: Some(round2(used / ratio)),
        remaining: if unlimited {
            None
        } else {
            Some(round2(available / ratio))
        },
        unit: Some(display.unit.clone()),
    });

    UsageResult {
        success: true,
        data: Some(out),
        error: None,
    }
}

async fn fetch_display(origin: &str) -> QuotaDisplay {
    let client = crate::proxy::http_client::get();
    let resp = client
        .get(format!("{origin}/api/status"))
        .header("Accept", "application/json")
        .header("User-Agent", crate::brand::USER_AGENT)
        .timeout(Duration::from_secs(10))
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => match r.json::<serde_json::Value>().await {
            Ok(body) => parse_status(&body),
            Err(_) => QuotaDisplay::default(),
        },
        _ => QuotaDisplay::default(),
    }
}

/// 解析 sub2api `GET /v1/usage` 的响应（api14 等线路）。
///
/// - `quota_limited`：Key 设置了总额度 → `quota.{limit,used,remaining}`（美元）
/// - `unrestricted` 钱包模式：`balance` 为账户余额，Key 本身不限额
/// - `unrestricted` 订阅模式：`planName` 为套餐名，`remaining` 为本周期剩余
pub fn parse_sub2api_usage(body: &serde_json::Value) -> UsageResult {
    if body.get("isValid").and_then(|v| v.as_bool()) == Some(false) {
        let status = body
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("inactive");
        return UsageResult {
            success: false,
            data: Some(vec![UsageData {
                plan_name: Some("key".to_string()),
                extra: None,
                is_valid: Some(false),
                invalid_message: Some(format!("API key {status}")),
                total: None,
                used: None,
                remaining: None,
                unit: None,
            }]),
            error: Some(format!("API key {status}")),
        };
    }
    if body.get("mode").is_none() && body.get("remaining").is_none() {
        let msg = body
            .get("message")
            .or_else(|| body.get("error").and_then(|e| e.get("message")))
            .and_then(|m| m.as_str())
            .unwrap_or("Unexpected response");
        return error_result(format!("WendingAI: {msg}"));
    }
    let unit = body
        .get("unit")
        .and_then(|v| v.as_str())
        .unwrap_or("USD")
        .to_string();
    let total_cost = body
        .get("usage")
        .and_then(|u| u.get("total"))
        .and_then(|t| num(t, "actual_cost").or_else(|| num(t, "cost")));
    let mut out = Vec::new();
    let quota = body.get("quota").filter(|q| q.is_object());
    let balance = num(body, "balance");
    if let Some(balance) = balance {
        out.push(UsageData {
            plan_name: Some("account".to_string()),
            extra: None,
            is_valid: Some(true),
            invalid_message: None,
            total: None,
            used: None,
            remaining: Some(round2(balance)),
            unit: Some(unit.clone()),
        });
    }
    let (remaining, used, total, unlimited) = if let Some(q) = quota {
        (
            num(q, "remaining"),
            num(q, "used").or(total_cost),
            num(q, "limit"),
            false,
        )
    } else if balance.is_some() {
        // 钱包模式：Key 不单独限额，用账户余额
        (None, total_cost, None, true)
    } else {
        (num(body, "remaining"), total_cost, None, false)
    };
    let plan = body.get("planName").and_then(|v| v.as_str());
    out.push(UsageData {
        plan_name: Some("key".to_string()),
        extra: Some(
            serde_json::json!({ "unlimited": unlimited, "plan": plan, "gateway": "sub2api" })
                .to_string(),
        ),
        is_valid: Some(true),
        invalid_message: None,
        total: total.map(round2),
        used: used.map(round2),
        remaining: remaining.map(round2),
        unit: Some(unit),
    });
    UsageResult {
        success: true,
        data: Some(out),
        error: None,
    }
}

/// 查询 WendingAI Key 的额度
pub async fn query(base_url: &str, api_key: &str) -> Result<UsageResult, String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Ok(error_result("API key is empty".to_string()));
    }
    let origin = crate::brand::origin_of(base_url);
    let sub2api = crate::brand::is_sub2api_url(&origin);
    let display = if sub2api {
        QuotaDisplay::default()
    } else {
        fetch_display(&origin).await
    };
    let path = if sub2api {
        "/v1/usage"
    } else {
        "/api/usage/token/"
    };

    let client = crate::proxy::http_client::get();
    let resp = client
        .get(format!("{origin}{path}"))
        .header("Authorization", format!("Bearer {key}"))
        .header("Accept", "application/json")
        .header("User-Agent", crate::brand::USER_AGENT)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e.without_url()))?;

    let status = resp.status();
    let raw = resp
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e.without_url()))?;
    let body: Option<serde_json::Value> = serde_json::from_slice(&raw).ok();
    let server_msg = body
        .as_ref()
        .and_then(|b| b.get("message"))
        .and_then(|m| m.as_str())
        .map(|s| s.to_string());

    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        let msg = server_msg.unwrap_or_else(|| "Invalid token".to_string());
        return Ok(UsageResult {
            success: false,
            data: Some(vec![UsageData {
                plan_name: Some("key".to_string()),
                extra: None,
                is_valid: Some(false),
                invalid_message: Some(format!("{msg} (HTTP {})", status.as_u16())),
                total: None,
                used: None,
                remaining: None,
                unit: None,
            }]),
            error: Some(format!(
                "Authentication failed (HTTP {}): {msg}",
                status.as_u16()
            )),
        });
    }
    if status.is_server_error() {
        return Err(format!("WendingAI server error (HTTP {})", status.as_u16()));
    }
    if !status.is_success() {
        return Ok(error_result(format!(
            "API error (HTTP {}): {}",
            status.as_u16(),
            server_msg.unwrap_or_default()
        )));
    }
    match body {
        Some(b) if sub2api => Ok(parse_sub2api_usage(&b)),
        Some(b) => Ok(parse_token_usage(&b, &display)),
        None => Ok(error_result("Failed to parse response".to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_status_ratio() {
        let d =
            parse_status(&json!({"data": {"quota_per_unit": 500000, "quota_display_type": "USD"}}));
        assert_eq!(d.quota_per_unit, 500000.0);
        assert_eq!(d.unit, "USD");
        let d = parse_status(&json!({"data": {"quota_per_unit": 0}}));
        assert_eq!(d.quota_per_unit, DEFAULT_QUOTA_PER_UNIT);
        let d = parse_status(
            &json!({"data": {"quota_display_type": "TOKENS", "quota_per_unit": 500000}}),
        );
        assert_eq!(d.unit, "tokens");
        assert_eq!(d.quota_per_unit, 1.0);
    }

    #[test]
    fn parses_token_usage_with_user_quota() {
        let body = json!({"code": true, "message": "ok", "data": {
            "object": "token_usage", "name": "desktop",
            "total_granted": 1_500_000, "total_used": 500_000, "total_available": 1_000_000,
            "unlimited_quota": false, "expires_at": 0,
            "user_quota": {"total_available": 5_000_000, "total_used": 250_000}
        }});
        let r = parse_token_usage(&body, &QuotaDisplay::default());
        assert!(r.success);
        let data = r.data.unwrap();
        assert_eq!(data.len(), 2);
        assert_eq!(data[0].plan_name.as_deref(), Some("account"));
        assert_eq!(data[0].remaining, Some(10.0));
        assert_eq!(data[0].used, Some(0.5));
        assert_eq!(data[1].plan_name.as_deref(), Some("key"));
        assert_eq!(data[1].remaining, Some(2.0));
        assert_eq!(data[1].used, Some(1.0));
        assert_eq!(data[1].total, Some(3.0));
        assert_eq!(data[1].unit.as_deref(), Some("USD"));
    }

    #[test]
    fn unlimited_key_has_no_remaining() {
        let body = json!({"code": true, "data": {
            "total_granted": 0, "total_used": 100, "total_available": 0, "unlimited_quota": true
        }});
        let r = parse_token_usage(&body, &QuotaDisplay::default());
        let key = &r.data.unwrap()[0];
        assert_eq!(key.remaining, None);
        assert!(key.extra.as_deref().unwrap().contains("\"unlimited\":true"));
    }

    #[test]
    fn expired_key_is_invalid() {
        let body = json!({"code": true, "data": {
            "total_available": 10, "total_used": 0, "expires_at": 1_000
        }});
        let r = parse_token_usage(&body, &QuotaDisplay::default());
        assert_eq!(r.data.unwrap()[0].is_valid, Some(false));
    }

    #[test]
    fn business_error_is_reported() {
        let r = parse_token_usage(
            &json!({"success": false, "message": "Invalid token"}),
            &QuotaDisplay::default(),
        );
        assert!(!r.success);
        assert!(r.error.unwrap().contains("Invalid token"));
    }

    #[test]
    fn parses_sub2api_quota_limited() {
        let body = json!({"mode": "quota_limited", "isValid": true, "status": "active",
            "quota": {"limit": 20.0, "used": 4.5, "remaining": 15.5, "unit": "USD"},
            "remaining": 15.5, "unit": "USD"});
        let r = parse_sub2api_usage(&body);
        assert!(r.success);
        let data = r.data.unwrap();
        assert_eq!(data.len(), 1);
        assert_eq!(data[0].remaining, Some(15.5));
        assert_eq!(data[0].used, Some(4.5));
        assert_eq!(data[0].total, Some(20.0));
    }

    #[test]
    fn parses_sub2api_wallet() {
        let body = json!({"mode": "unrestricted", "isValid": true, "planName": "钱包余额",
            "remaining": 12.345, "unit": "USD", "balance": 12.345,
            "usage": {"total": {"cost": 3.0, "actual_cost": 2.5}}});
        let data = parse_sub2api_usage(&body).data.unwrap();
        assert_eq!(data[0].plan_name.as_deref(), Some("account"));
        assert_eq!(data[0].remaining, Some(12.35));
        assert_eq!(data[1].plan_name.as_deref(), Some("key"));
        assert_eq!(data[1].remaining, None);
        assert_eq!(data[1].used, Some(2.5));
        assert!(data[1]
            .extra
            .as_deref()
            .unwrap()
            .contains("\"unlimited\":true"));
    }

    #[test]
    fn parses_sub2api_subscription_and_invalid() {
        let body = json!({"mode": "unrestricted", "isValid": true, "planName": "Pro",
            "remaining": 7.0, "unit": "USD"});
        let data = parse_sub2api_usage(&body).data.unwrap();
        assert_eq!(data.len(), 1);
        assert_eq!(data[0].remaining, Some(7.0));
        let r = parse_sub2api_usage(
            &json!({"mode": "quota_limited", "isValid": false, "status": "disabled"}),
        );
        assert!(!r.success);
        assert_eq!(r.data.unwrap()[0].is_valid, Some(false));
        let r =
            parse_sub2api_usage(&json!({"code": "INVALID_API_KEY", "message": "Invalid API key"}));
        assert!(!r.success);
    }

    /// 联网测试：api14（sub2api）对无效 Key 返回 401，结果为“无效 Key”且不含 Key。
    #[tokio::test]
    #[ignore = "network"]
    async fn live_invalid_key_api14() {
        let fake = "sk-wendingai-invalid-test-key-0000000000";
        let result = query("https://api14.wending.ai", fake)
            .await
            .expect("an invalid key is a normal (non-error) result");
        assert!(!result.success);
        let data = result.data.expect("invalid key returns a data row");
        assert_eq!(data[0].is_valid, Some(false));
        assert!(!format!("{:?}", data).contains(fake));
        println!("api14 invalid-key result: error={:?}", result.error);
    }

    /// 联网测试：用一个明显无效的 Key 请求 api.wending.ai，确认错误处理正确、错误信息里不含 Key。
    /// 默认忽略；运行：cargo test --lib wending_quota::tests::live_invalid_key -- --ignored
    #[tokio::test]
    #[ignore = "network"]
    async fn live_invalid_key() {
        let fake = "sk-wendingai-invalid-test-key-0000000000";
        let result = query(crate::brand::DEFAULT_ENDPOINT, fake)
            .await
            .expect("an invalid key is a normal (non-error) result");
        assert!(!result.success);
        let data = result.data.expect("invalid key returns a data row");
        assert_eq!(data[0].is_valid, Some(false));
        let dump = format!("{:?}", data);
        assert!(!dump.contains(fake), "key must never appear in results");
        println!(
            "live invalid-key result: success={} error={:?}",
            result.success, result.error
        );
    }
}
