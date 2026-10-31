import hashlib
import os
import sys

from huggingface_hub import HfApi, create_repo, upload_folder
from huggingface_hub.errors import HfHubHTTPError

README = """---
title: 小木社区
emoji: "\U0001F343"
colorFrom: green
colorTo: green
sdk: docker
app_port: 10000
pinned: false
---

小木社区
"""


def main() -> None:
    token = (os.environ.get("HF_TOKEN") or "").strip()
    backup = (os.environ.get("BACKUP_TOKEN") or "").strip()
    if not token:
        sys.exit("缺少仓库 Secret: HF_TOKEN（HF Write token）")
    if not backup:
        sys.exit("缺少仓库 Secret: BACKUP_TOKEN（GitHub 备份仓库 token）")

    repo_id = os.environ.get("SPACE_REPO", "linqing66/xiaomu-community")
    api = HfApi(token=token)
    if not api.repo_exists(repo_id, repo_type="space"):
        try:
            create_repo(repo_id, repo_type="space", space_sdk="docker", exist_ok=True, private=False)
        except HfHubHTTPError as e:
            if "402" in str(e):
                sys.exit(
                    "HF 拒绝由 API 创建 Space（402 Payment Required）。"
                    "请先在 https://huggingface.co/new-space 手动创建："
                    "Owner=linqing66，Space name=xiaomu-community，SDK=Docker，Public。"
                )
            raise

    # JWT 密钥由备份 token 派生：跨次部署保持稳定，且不写进公开仓库
    jwt_secret = hashlib.sha256(("votehub-jwt-" + backup).encode()).hexdigest()
    for key, value in {
        "JWT_SECRET": jwt_secret,
        "BACKUP_REPO": "lingjian140/csui",
        "BACKUP_BRANCH": "xiaomu-backup",
        "BACKUP_TOKEN": backup,
        "SEED_ADMIN_USERNAME": "xiaomu",
        "SEED_ADMIN_PASSWORD": "xiaomu",
        "SEED_USER_USERNAME": "aimin",
        "SEED_USER_PASSWORD": "mu123123123",
        "TZ": "Asia/Shanghai",
        "PORT": "10000",
    }.items():
        api.add_space_secret(repo_id, key, value)

    api.upload_file(
        path_or_fileobj=README.encode("utf-8"),
        path_in_repo="README.md",
        repo_id=repo_id,
        repo_type="space",
    )

    upload_folder(
        repo_id=repo_id,
        repo_type="space",
        folder_path=".",
        ignore_patterns=[
            "android-app/**",
            "apk/**",
            ".git/**",
            ".github/**",
            "data/**",
            "uploads/**",
            ".uploads/**",
            "node_modules/**",
            "*.log",
            ".env",
        ],
    )
    print("Space updated:", api.repo_info(repo_id, repo_type="space").id)
    print("URL: https://" + repo_id.replace("/", "-") + ".hf.space")

    runtime = api.get_space_runtime(repo_id)
    print("stage before restart:", runtime.stage)
    api.restart_space(repo_id, factory_reboot=True)
    print("stage after restart:", api.get_space_runtime(repo_id).stage)


if __name__ == "__main__":
    main()

# 说明：Space 由网页创建后，本脚本只推送代码与注入 secrets。
