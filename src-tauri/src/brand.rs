//! WendingAI 品牌层（Rust 侧）。
//!
//! 与前端 `src/brand/brand.ts` 对应。上游代码只通过这里的常量引用品牌信息，
//! 方便与上游 CC Switch 合并（MIT License）。

/// 产品名（窗口、托盘、日志）
pub const PRODUCT_NAME: &str = "WendingAI Switch";
/// 品牌名（只显示 WendingAI，不显示公司全称）
pub const BRAND_NAME: &str = "WendingAI";
/// 数据目录名（位于用户主目录下）。与上游 `~/.cc-switch` 完全隔离，避免与已安装的 WendingAI Switch 共用数据库。
pub const DATA_DIR_NAME: &str = ".wendingai";
/// 深链接协议
pub const DEEPLINK_SCHEME: &str = "wendingai";
/// 默认 API 地址
pub const DEFAULT_ENDPOINT: &str = "https://api.wending.ai";
/// 统一供应商类型
pub const PROVIDER_TYPE: &str = "wendingai";
/// 对外请求的 User-Agent
/// 诊断日志文件名（不含扩展名），位于 <app_config_dir>/logs/
pub const LOG_FILE_STEM: &str = "wendingai-switch";

pub const USER_AGENT: &str = concat!("WendingAI-Switch/", env!("CARGO_PKG_VERSION"));

/// 判断地址是否属于 WendingAI（api.wending.ai 及 *.wending.ai）
pub fn is_wending_url(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    let rest = lower
        .strip_prefix("https://")
        .or_else(|| lower.strip_prefix("http://"))
        .unwrap_or(&lower);
    let host = rest
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .rsplit('@')
        .next()
        .unwrap_or("");
    let host = host.split(':').next().unwrap_or("");
    host == "wending.ai" || host.ends_with(".wending.ai")
}

/// 从任意 WendingAI 地址（可能带 /v1 等路径）取出站点根地址
pub fn origin_of(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    if let Some((scheme, rest)) = trimmed.split_once("://") {
        let host = rest.split('/').next().unwrap_or(rest);
        format!("{scheme}://{host}")
    } else {
        DEFAULT_ENDPOINT.to_string()
    }
}

/// 打码显示 API Key：sk-****abcd
pub fn mask_key(key: &str) -> String {
    let k = key.trim();
    if k.is_empty() {
        return String::new();
    }
    // 太短的 Key 不显示任何字符，避免露出整串
    if k.chars().count() <= 12 {
        return "****".to_string();
    }
    let tail: String = k
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    let prefix = if k.starts_with("sk-") { "sk-" } else { "" };
    format!("{prefix}****{tail}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_wending_hosts() {
        assert!(is_wending_url("https://api.wending.ai"));
        assert!(is_wending_url("https://api.wending.ai/v1"));
        assert!(is_wending_url("HTTPS://API.WENDING.AI/"));
        assert!(!is_wending_url("https://api.wending.ai.evil.com"));
        assert!(!is_wending_url("https://evil.com/?u=api.wending.ai"));
        assert!(!is_wending_url("https://notwending.ai"));
    }

    #[test]
    fn origin_strips_path() {
        assert_eq!(
            origin_of("https://api.wending.ai/v1/"),
            "https://api.wending.ai"
        );
        assert_eq!(
            origin_of("https://api.wending.ai"),
            "https://api.wending.ai"
        );
    }

    #[test]
    fn masks_key() {
        assert_eq!(mask_key("sk-abcdef1234567890"), "sk-****7890");
        assert_eq!(mask_key("short"), "****");
        assert_eq!(mask_key(""), "");
        assert!(!mask_key("sk-secretvalue9999").contains("secret"));
    }
}
