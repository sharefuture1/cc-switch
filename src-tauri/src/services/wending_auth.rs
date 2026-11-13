//! WendingAI 一键授权登录（桌面端）。
//!
//! 使用 api.wending.ai 已有的 OAuth 2.0 授权码 + PKCE（S256）流程，桌面端作为**公共客户端**
//! （不带 client secret），回调走本机回环地址（RFC 8252）：
//!
//! 1. `start_login`：在 `127.0.0.1:<随机端口>` 监听，生成 state / code_verifier，
//!    返回浏览器授权地址 `{origin}/oauth/authorize?...`（含 device_id / device_name，
//!    让每台电脑单独一把 Key，重新授权只轮换本机的 Key）。
//! 2. 用户在浏览器登录 WendingAI 并点“授权”，浏览器被重定向到
//!    `http://127.0.0.1:<端口>/wending/callback?code=…&state=…`。
//! 3. 后台任务校验 state，用 code + code_verifier 调 `POST {origin}/api/oauth/token`
//!    换取专用 API Key；前端轮询 `poll_login` 拿到 Key 后走与“粘贴 Key”相同的配置流程。
//!
//! `probe` 用公开接口 `GET {origin}/api/oauth/clients/{client_id}` 判断服务端是否已开放
//! 桌面端一键登录；不可用时界面回落到粘贴 Key。
//! 任何日志和错误信息都不包含授权码、verifier 或 Key。

use std::sync::Mutex;
use std::time::Duration;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

/// 服务端注册的桌面端 client_id（公共客户端，固定写在应用里）
pub const CLIENT_ID: &str = "wd_wendingai_switch";
/// 回调路径；服务端注册 `http://127.0.0.1/wending/callback`（任意端口）
pub const CALLBACK_PATH: &str = "/wending/callback";
/// 等待浏览器授权的最长时间（服务端授权码本身 5 分钟过期）
const LOGIN_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const MAX_REQUEST_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WendingAuthProbe {
    pub available: bool,
    /// 不可用原因：`not_registered`（服务端尚未开放）、`network`、`invalid_base`
    pub reason: Option<String>,
    pub client_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WendingLoginStart {
    pub flow_id: String,
    pub auth_url: String,
    pub expires_in: u64,
}

/// 轮询结果：`pending` 时 `api_key` 为空
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WendingLoginPoll {
    pub status: String,
    pub api_key: Option<String>,
    pub error: Option<String>,
}

struct PendingLogin {
    flow_id: String,
    result: oneshot::Receiver<Result<String, String>>,
    task: tokio::task::AbortHandle,
}

static PENDING: Mutex<Option<PendingLogin>> = Mutex::new(None);

/// 只允许 WendingAI 的 https 地址；本机回环 http 地址仅用于开发 / 端到端测试。
pub fn auth_origin(base_url: &str) -> Result<String, String> {
    let url = url::Url::parse(base_url.trim()).map_err(|_| "invalid_base".to_string())?;
    let host = url.host_str().unwrap_or("").to_ascii_lowercase();
    let ok = match url.scheme() {
        "https" => host == "wending.ai" || host.ends_with(".wending.ai"),
        "http" => host == "127.0.0.1" || host == "localhost",
        _ => false,
    };
    if !ok || !url.username().is_empty() || url.password().is_some() {
        return Err("invalid_base".to_string());
    }
    Ok(url.origin().ascii_serialization())
}

fn random_token() -> String {
    let mut bytes = Vec::with_capacity(32);
    bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    URL_SAFE_NO_PAD.encode(&bytes)
}

pub fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// 每次安装固定的设备 ID（随机生成，保存在数据目录），不含任何硬件信息
pub fn device_id() -> String {
    let path = crate::config::get_app_config_dir().join("wending-device-id");
    if let Ok(existing) = std::fs::read_to_string(&path) {
        let id = existing.trim().to_string();
        if id.len() >= 8
            && id.len() <= 64
            && id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return id;
        }
    }
    let id = format!("ws-{}", uuid::Uuid::new_v4().simple());
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, &id);
    id
}

/// 设备名：电脑名（取不到时用系统名），最多 32 个字符
pub fn device_name() -> String {
    let from_env = std::env::var("COMPUTERNAME").ok();
    let name = from_env
        .or_else(|| {
            #[cfg(target_os = "macos")]
            {
                std::process::Command::new("scutil")
                    .args(["--get", "ComputerName"])
                    .output()
                    .ok()
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            }
            #[cfg(not(target_os = "macos"))]
            {
                None
            }
        })
        .filter(|s| !s.is_empty())
        .or_else(|| {
            std::fs::read_to_string("/etc/hostname")
                .ok()
                .map(|s| s.trim().to_string())
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| match std::env::consts::OS {
            "macos" => "Mac".to_string(),
            "windows" => "Windows".to_string(),
            other => other.to_string(),
        });
    name.chars().filter(|c| !c.is_control()).take(32).collect()
}

/// 构造浏览器授权地址
pub fn authorize_url(
    origin: &str,
    redirect_uri: &str,
    state: &str,
    challenge: &str,
    device_id: &str,
    device_name: &str,
) -> String {
    let mut url = url::Url::parse(&format!("{origin}/oauth/authorize")).expect("valid origin");
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", CLIENT_ID)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("state", state)
        .append_pair("scope", "api")
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("device_id", device_id)
        .append_pair("device_name", device_name);
    url.to_string()
}

/// 服务端是否已开放桌面端一键登录
pub async fn probe(base_url: &str) -> WendingAuthProbe {
    let origin = match auth_origin(base_url) {
        Ok(o) => o,
        Err(reason) => {
            return WendingAuthProbe {
                available: false,
                reason: Some(reason),
                client_name: None,
            }
        }
    };
    let client = crate::proxy::http_client::get();
    let resp = client
        .get(format!("{origin}/api/oauth/clients/{CLIENT_ID}"))
        .header("Accept", "application/json")
        .header("User-Agent", crate::brand::USER_AGENT)
        .timeout(Duration::from_secs(10))
        .send()
        .await;
    let resp = match resp {
        Ok(r) => r,
        Err(_) => {
            return WendingAuthProbe {
                available: false,
                reason: Some("network".into()),
                client_name: None,
            }
        }
    };
    let status = resp.status();
    let body: Option<serde_json::Value> = resp.json().await.ok();
    let data = body
        .as_ref()
        .filter(|b| b.get("success").and_then(|v| v.as_bool()) == Some(true))
        .and_then(|b| b.get("data"));
    match data {
        Some(d)
            if status.is_success()
                && d.get("client_id").and_then(|v| v.as_str()) == Some(CLIENT_ID)
                && d.get("is_public").and_then(|v| v.as_bool()) == Some(true) =>
        {
            WendingAuthProbe {
                available: true,
                reason: None,
                client_name: d.get("name").and_then(|v| v.as_str()).map(String::from),
            }
        }
        _ if status.is_server_error() => WendingAuthProbe {
            available: false,
            reason: Some("network".into()),
            client_name: None,
        },
        _ => WendingAuthProbe {
            available: false,
            reason: Some("not_registered".into()),
            client_name: None,
        },
    }
}

/// 开始一键登录：监听回环端口，返回需要在浏览器打开的授权地址
pub async fn start_login(base_url: &str) -> Result<WendingLoginStart, String> {
    let origin = auth_origin(base_url)?;
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|e| format!("无法监听本机端口: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}{CALLBACK_PATH}");
    let state = random_token();
    let verifier = random_token();
    let auth_url = authorize_url(
        &origin,
        &redirect_uri,
        &state,
        &pkce_challenge(&verifier),
        &device_id(),
        &device_name(),
    );

    let (sender, receiver) = oneshot::channel();
    let flow_state = state.clone();
    let task = tokio::spawn(async move {
        let outcome = tokio::time::timeout(
            LOGIN_TIMEOUT,
            finish_login(listener, &origin, &flow_state, &verifier, &redirect_uri),
        )
        .await
        .unwrap_or_else(|_| Err("timeout".to_string()));
        let _ = sender.send(outcome);
    });

    let previous = PENDING.lock().unwrap().replace(PendingLogin {
        flow_id: state.clone(),
        result: receiver,
        task: task.abort_handle(),
    });
    if let Some(previous) = previous {
        previous.task.abort();
    }
    Ok(WendingLoginStart {
        flow_id: state,
        auth_url,
        expires_in: LOGIN_TIMEOUT.as_secs(),
    })
}

/// 轮询：`pending` / `done`（带 Key）/ `error`（带错误码）
pub fn poll_login(flow_id: &str) -> WendingLoginPoll {
    let mut pending = PENDING.lock().unwrap();
    let Some(login) = pending.as_mut().filter(|l| l.flow_id == flow_id) else {
        return WendingLoginPoll {
            status: "error".into(),
            api_key: None,
            error: Some("flow_ended".into()),
        };
    };
    match login.result.try_recv() {
        Err(oneshot::error::TryRecvError::Empty) => WendingLoginPoll {
            status: "pending".into(),
            api_key: None,
            error: None,
        },
        Err(oneshot::error::TryRecvError::Closed) => {
            pending.take();
            WendingLoginPoll {
                status: "error".into(),
                api_key: None,
                error: Some("flow_ended".into()),
            }
        }
        Ok(result) => {
            pending.take();
            match result {
                Ok(key) => WendingLoginPoll {
                    status: "done".into(),
                    api_key: Some(key),
                    error: None,
                },
                Err(e) => WendingLoginPoll {
                    status: "error".into(),
                    api_key: None,
                    error: Some(e),
                },
            }
        }
    }
}

pub fn cancel_login(flow_id: &str) {
    let mut pending = PENDING.lock().unwrap();
    if pending.as_ref().is_some_and(|l| l.flow_id == flow_id) {
        if let Some(login) = pending.take() {
            login.task.abort();
        }
    }
}

enum Callback {
    Code(String),
    Error(String),
}

async fn finish_login(
    listener: TcpListener,
    origin: &str,
    state: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<String, String> {
    let (callback, mut browser) = wait_for_callback(&listener, state).await?;
    let result = match callback {
        Callback::Error(e) => Err(e),
        Callback::Code(code) => exchange_code(origin, &code, verifier, redirect_uri).await,
    };
    let page = match &result {
        Ok(_) => page_html(true, ""),
        Err(e) if e == "access_denied" => page_html(false, "你已取消授权。"),
        Err(_) => page_html(false, "授权没有完成，请回到 WendingAI Switch 重试。"),
    };
    let _ = respond(&mut browser, "200 OK", &page).await;
    result
}

/// 用授权码换 Key（公共客户端：client_id + code_verifier，无 secret）
pub async fn exchange_code(
    origin: &str,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<String, String> {
    let client = crate::proxy::http_client::get();
    let resp = client
        .post(format!("{origin}/api/oauth/token"))
        .header("Accept", "application/json")
        .header("User-Agent", crate::brand::USER_AGENT)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect_uri),
            ("client_id", CLIENT_ID),
            ("code_verifier", verifier),
        ])
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("network: {}", e.without_url()))?;
    let status = resp.status();
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|_| format!("token_http_{}", status.as_u16()))?;
    if !status.is_success() {
        let code = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("token_error");
        return Err(code.to_string());
    }
    let key = body
        .get("access_token")
        .and_then(|v| v.as_str())
        .filter(|k| !k.is_empty() && k.bytes().all(|b| (0x21..=0x7e).contains(&b)))
        .ok_or_else(|| "missing_token".to_string())?;
    Ok(key.to_string())
}

async fn wait_for_callback(
    listener: &TcpListener,
    state: &str,
) -> Result<(Callback, TcpStream), String> {
    loop {
        let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
        let Ok(head) = read_request_head(&mut stream).await else {
            continue;
        };
        let Some(query) = callback_query(&head) else {
            let _ = respond(&mut stream, "404 Not Found", "").await;
            continue;
        };
        match parse_callback(query, state) {
            Some(cb) => return Ok((cb, stream)),
            None => {
                let _ = respond(&mut stream, "400 Bad Request", "").await;
            }
        }
    }
}

/// state 必须恰好一个且与本次一致；返回 code 或服务端的 error（如 access_denied）
fn parse_callback(query: &str, state: &str) -> Option<Callback> {
    let params: Vec<(String, String)> = url::form_urlencoded::parse(query.as_bytes())
        .into_owned()
        .collect();
    let values = |name: &str| -> Vec<&str> {
        params
            .iter()
            .filter(|(k, _)| k == name)
            .map(|(_, v)| v.as_str())
            .collect()
    };
    let states = values("state");
    let state_ok = states.len() == 1
        && states[0].len() == state.len()
        && bool::from(subtle::ConstantTimeEq::ct_eq(
            states[0].as_bytes(),
            state.as_bytes(),
        ));
    if !state_ok {
        return None;
    }
    let errors = values("error");
    if let Some(err) = errors.first() {
        let safe: String = err
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
            .take(64)
            .collect();
        return Some(Callback::Error(if safe.is_empty() {
            "authorize_error".into()
        } else {
            safe
        }));
    }
    let codes = values("code");
    (codes.len() == 1 && !codes[0].is_empty()).then(|| Callback::Code(codes[0].to_owned()))
}

async fn read_request_head(stream: &mut TcpStream) -> std::io::Result<String> {
    let mut buffer = Vec::with_capacity(1024);
    let mut chunk = [0u8; 1024];
    loop {
        let read = tokio::time::timeout(Duration::from_secs(10), stream.read(&mut chunk))
            .await
            .map_err(|_| std::io::Error::from(std::io::ErrorKind::TimedOut))??;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.windows(4).any(|w| w == b"\r\n\r\n") || buffer.len() > MAX_REQUEST_BYTES {
            break;
        }
    }
    Ok(String::from_utf8_lossy(&buffer).into_owned())
}

fn callback_query(head: &str) -> Option<&str> {
    let mut parts = head.lines().next()?.split(' ');
    if parts.next()? != "GET" {
        return None;
    }
    let (path, query) = parts.next()?.split_once('?')?;
    (path == CALLBACK_PATH).then_some(query)
}

async fn respond(stream: &mut TcpStream, status: &str, body: &str) -> std::io::Result<()> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(response.as_bytes()).await?;
    stream.shutdown().await
}

fn page_html(ok: bool, message: &str) -> String {
    let (title, text, color) = if ok {
        (
            "授权成功",
            "WendingAI Switch 正在自动配置 Claude Code、Codex 和 Gemini CLI，可以关闭这个页面了。",
            "#16a34a",
        )
    } else {
        ("授权未完成", message, "#dc2626")
    };
    format!(
        "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>WendingAI Switch</title></head>\
<body style=\"margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#111\">\
<div style=\"background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:40px 48px;max-width:420px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.06)\">\
<div style=\"width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:{color};color:#fff;font-size:30px;line-height:56px\">{icon}</div>\
<h1 style=\"font-size:20px;margin:0 0 8px\">{title}</h1><p style=\"margin:0;color:#555;line-height:1.6;font-size:14px\">{text}</p>\
<p style=\"margin:20px 0 0;color:#999;font-size:12px\">WendingAI Switch</p></div></body></html>",
        icon = if ok { "&#10003;" } else { "!" },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_wending_or_loopback_bases() {
        assert_eq!(
            auth_origin("https://api.wending.ai/v1").unwrap(),
            "https://api.wending.ai"
        );
        assert_eq!(
            auth_origin("http://127.0.0.1:3000").unwrap(),
            "http://127.0.0.1:3000"
        );
        for bad in [
            "http://api.wending.ai",
            "https://evil.example",
            "https://wending.ai.evil.example",
            "https://user:pw@api.wending.ai",
            "file:///etc/passwd",
            "not a url",
        ] {
            assert!(auth_origin(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn pkce_matches_rfc7636_example() {
        // RFC 7636 Appendix B
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        let t = random_token();
        assert_eq!(t.len(), 43);
        assert_ne!(t, random_token());
    }

    #[test]
    fn builds_authorize_url() {
        let url = authorize_url(
            "https://api.wending.ai",
            "http://127.0.0.1:5000/wending/callback",
            "st",
            "ch",
            "ws-abc12345",
            "我的 Mac",
        );
        let parsed = url::Url::parse(&url).unwrap();
        assert_eq!(parsed.path(), "/oauth/authorize");
        let q: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
        assert_eq!(q["client_id"], CLIENT_ID);
        assert_eq!(q["redirect_uri"], "http://127.0.0.1:5000/wending/callback");
        assert_eq!(q["code_challenge_method"], "S256");
        assert_eq!(q["device_name"], "我的 Mac");
    }

    #[test]
    fn callback_requires_matching_state() {
        assert!(matches!(
            parse_callback("code=abc&state=s1", "s1"),
            Some(Callback::Code(c)) if c == "abc"
        ));
        assert!(parse_callback("code=abc&state=s2", "s1").is_none());
        assert!(parse_callback("code=abc", "s1").is_none());
        assert!(parse_callback("code=abc&state=s1&state=s1", "s1").is_none());
        assert!(parse_callback("code=a&code=b&state=s1", "s1").is_none());
        assert!(matches!(
            parse_callback("error=access_denied&state=s1", "s1"),
            Some(Callback::Error(e)) if e == "access_denied"
        ));
        assert_eq!(
            callback_query("GET /wending/callback?code=1&state=2 HTTP/1.1\r\n"),
            Some("code=1&state=2")
        );
        assert_eq!(callback_query("GET /favicon.ico HTTP/1.1\r\n"), None);
        assert_eq!(
            callback_query("POST /wending/callback?code=1 HTTP/1.1\r\n"),
            None
        );
    }

    #[test]
    fn device_name_is_bounded() {
        let name = device_name();
        assert!(!name.is_empty());
        assert!(name.chars().count() <= 32);
    }

    /// 端到端：对本机运行的 new-api（含桌面端补丁）完成一次完整的一键登录。
    /// 浏览器部分由外部脚本完成：本测试把授权地址写到 $WENDING_AUTH_E2E_URL_FILE，
    /// 外部脚本在浏览器里登录并点“授权”，本测试拿到 Key 后写入 $WENDING_AUTH_E2E_KEY_FILE。
    /// 运行：WENDING_AUTH_E2E_BASE=http://127.0.0.1:3300 cargo test --lib wending_auth::tests::e2e_local -- --ignored --nocapture
    #[tokio::test]
    #[ignore = "needs a local new-api and a browser driver"]
    async fn e2e_local() {
        let base = std::env::var("WENDING_AUTH_E2E_BASE").expect("WENDING_AUTH_E2E_BASE");
        let url_file = std::env::var("WENDING_AUTH_E2E_URL_FILE").expect("URL file");
        let key_file = std::env::var("WENDING_AUTH_E2E_KEY_FILE").expect("key file");
        let probe = probe(&base).await;
        assert!(probe.available, "probe: {probe:?}");
        let start = start_login(&base).await.expect("start");
        std::fs::write(&url_file, &start.auth_url).unwrap();
        println!("authorize url written; waiting for the browser…");
        let deadline = std::time::Instant::now() + Duration::from_secs(180);
        loop {
            let poll = poll_login(&start.flow_id);
            match poll.status.as_str() {
                "pending" => {
                    assert!(std::time::Instant::now() < deadline, "timed out");
                    tokio::time::sleep(Duration::from_millis(300)).await;
                }
                "done" => {
                    let key = poll.api_key.unwrap();
                    assert!(key.starts_with("sk-"));
                    std::fs::write(&key_file, key).unwrap();
                    println!("login done; key written (not printed)");
                    break;
                }
                _ => panic!("login failed: {:?}", poll.error),
            }
        }
    }
}
