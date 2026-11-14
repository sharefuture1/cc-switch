use crate::provider::UsageResult;

#[tauri::command]
pub async fn get_balance(base_url: String, api_key: String) -> Result<UsageResult, String> {
    crate::services::balance::get_balance(&base_url, &api_key).await
}

// ── WendingAI 一键授权登录 ──────────────────────────────────

use crate::services::wending_auth::{self, WendingAuthProbe, WendingLoginPoll, WendingLoginStart};

#[tauri::command]
pub async fn wending_auth_probe(base_url: String) -> Result<WendingAuthProbe, String> {
    Ok(wending_auth::probe(&base_url).await)
}

#[tauri::command]
pub async fn wending_auth_start(base_url: String) -> Result<WendingLoginStart, String> {
    wending_auth::start_login(&base_url).await
}

#[tauri::command]
pub fn wending_auth_poll(flow_id: String) -> WendingLoginPoll {
    wending_auth::poll_login(&flow_id)
}

#[tauri::command]
pub fn wending_auth_cancel(flow_id: String) {
    wending_auth::cancel_login(&flow_id)
}

// ── WendingAI 一键配置：DeepSeek Harness 默认模型 ─────────────

/// 把 DSH 的默认模型设为 `provider/model`（写入所有目标 profile 的 `agent-default-model`）。
#[tauri::command]
pub fn wending_dsh_set_default_model(provider: String, model: String) -> Result<(), String> {
    crate::dsh_config::set_default_model(&provider, &model).map_err(|e| e.to_string())
}
