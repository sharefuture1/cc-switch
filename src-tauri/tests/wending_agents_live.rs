//! 本地端到端（默认忽略）：把前端一键配置生成的调用（`tests/brand/agents.dump.test.ts` 导出）
//! 交给真实的后端写入代码，在 `$WENDING_AGENTS_HOME` 下生成 Hermes / OpenClaw / DSH 的配置文件，
//! 之后可以直接用真实 CLI 读取验证。
//!
//! ```sh
//! WENDING_AGENTS_HOME=/tmp/agent-home WENDING_AGENTS_CALLS=/tmp/wending-e2e/plan-main.json \
//!   cargo test --test wending_agents_live -- --ignored --nocapture
//! ```
use std::sync::Arc;

use cc_switch_lib::{
    get_openclaw_model_catalog, set_openclaw_default_model, set_openclaw_model_catalog,
    wending_dsh_set_default_model, AppState, AppType, Database, Provider, ProviderService,
};
use serde_json::Value;

fn app_type(id: &str) -> AppType {
    match id {
        "hermes" => AppType::Hermes,
        "openclaw" => AppType::OpenClaw,
        "dsh" => AppType::Dsh,
        other => panic!("unexpected app {other}"),
    }
}

#[test]
#[ignore = "writes real config files under $WENDING_AGENTS_HOME"]
fn replay_wending_agent_setup() {
    let home = std::env::var("WENDING_AGENTS_HOME").expect("WENDING_AGENTS_HOME");
    let calls_path = std::env::var("WENDING_AGENTS_CALLS").expect("WENDING_AGENTS_CALLS");
    std::fs::create_dir_all(&home).expect("create home");
    std::env::set_var("CC_SWITCH_TEST_HOME", &home);
    std::env::set_var("HOME", &home);
    std::env::remove_var("DSH_HOME");

    let state = AppState::new(Arc::new(Database::init().expect("init db")));
    let calls: Vec<Value> =
        serde_json::from_str(&std::fs::read_to_string(calls_path).expect("read calls"))
            .expect("parse calls");

    for call in calls {
        let args = call["args"].as_array().expect("args");
        match call["fn"].as_str().expect("fn") {
            "getAll" | "getModelCatalog" => {}
            "add" => {
                let provider: Provider = serde_json::from_value(args[0].clone()).expect("provider");
                let app = app_type(args[1].as_str().unwrap());
                ProviderService::add(&state, app, provider, args[2].as_bool().unwrap_or(true))
                    .expect("add provider");
                println!("added provider to {}", args[1]);
            }
            "update" => {
                let provider: Provider = serde_json::from_value(args[0].clone()).expect("provider");
                let app = app_type(args[1].as_str().unwrap());
                ProviderService::update(&state, app, None, provider).expect("update provider");
            }
            "addToLiveConfig" => {
                let app = app_type(args[1].as_str().unwrap());
                ProviderService::add_to_live_config(&state, app, args[0].as_str().unwrap())
                    .expect("add to live");
            }
            "switch" => {
                let app = app_type(args[1].as_str().unwrap());
                ProviderService::switch(&state, app, args[0].as_str().unwrap()).expect("switch");
                println!("switched {}", args[1]);
            }
            "setModelCatalog" => {
                let before = get_openclaw_model_catalog().expect("catalog");
                println!("openclaw catalog before: {before:?}");
                set_openclaw_model_catalog(serde_json::from_value(args[0].clone()).unwrap())
                    .expect("set catalog");
            }
            "setDefaultModel" => {
                set_openclaw_default_model(serde_json::from_value(args[0].clone()).unwrap())
                    .expect("set default model");
            }
            "wending_dsh_set_default_model" => {
                let a = &args[0];
                wending_dsh_set_default_model(
                    a["provider"].as_str().unwrap().to_string(),
                    a["model"].as_str().unwrap().to_string(),
                )
                .expect("dsh default model");
                println!("dsh default model set");
            }
            other => panic!("unexpected call {other}"),
        }
    }
}
