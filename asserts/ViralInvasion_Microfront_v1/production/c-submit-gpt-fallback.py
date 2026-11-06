"""One explicitly authorized GPT fallback for the failed C supply source.

The failed original receipt is immutable here. A written request prevents replay.
Use maliang-batch.py resume with c-fallback-prompts.json after this submission.
"""
from pathlib import Path
import json
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
KEY = "camp.supply.gpt-fallback"
CLI = Path(r"D:\Workspace\Projects\xsj\SHJ-Product\项目大脑\工具箱\skills\maliang-skill\skills\maliang\scripts\maliang.py")


def write_new(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def main():
    old = json.loads((HERE / "responses/camp.supply.resume.json").read_text(encoding="utf-8"))
    attempts = old["data"]["attempts"]
    if old["data"]["status"] != "failed" or len(attempts) != 1:
        raise SystemExit("Fallback requires exactly one confirmed failed original attempt")
    if attempts[0].get("modelId") != "doubao-seedream-5-0-pro" or attempts[0].get("status") != "failed":
        raise SystemExit("Unexpected original attempt; inspect without generating")
    catalog_path = HERE / "c-fallback-prompts.json"
    request_path = HERE / "requests" / (KEY + ".submit.json")
    receipt_path = HERE / "receipts" / (KEY + ".json")
    if request_path.exists() or receipt_path.exists() or catalog_path.exists():
        raise SystemExit("Fallback checkpoint exists. Resume/read only; do not replay")
    catalog = json.loads((HERE / "c-prompts.json").read_text(encoding="utf-8"))
    item = dict(catalog["sources"]["camp.supply"])
    item["prompt"] = "制作一件独立的二维手绘游戏微流体补给囊，只画指定单体。严格沿用本次微观前哨概念的奶油白、薄荷青与少量暖珊瑚；旧补给图仅用于正交四分之三轻斜俯视镜头、窄高比例、出液口与接液槽的位置，不继承旧叶子。单个圆筒状奶油生物陶瓷储囊，薄荷青宽环带，正面偏右短出液管与一体小接液槽。顶盖为两层钝圆半透明膜盘组成的圆顶，短蛋白扣环固定，没有叶尖、叶柄、叶脉或蘑菇形态；底部为三枚奶白蛋白支座，没有石块和根。膜材质以柔和叠层和局部明暗表达，囊内仅淡青液面，不出现完整细胞或器官。清新绘本、哑光宽色块、极细柔和轮廓、柔和体积，保持本游戏的短小亲和尺度。完整物体居中，最长轴约占正方画布七成，底部中心接地、四周留足透明空间。输出原生透明背景PNG，保留主体柔和边缘与膜片半透明，不要纯白底、灰底、棋盘格、场景、地面、阴影盘、外发光、文字、角色、UI、水印、植物、木材、铁砧或石头。"
    item["model"] = "gpt-image-2"
    item["fallback_model"] = None
    item["resolution"] = "2048x2048"
    item["settings"] = {"outputFormat": "png", "quality": "high", "background": "transparent"}
    new_catalog = {"schemaVersion": 1, "theme": catalog["theme"], "canvas": catalog["canvas"], "canonicalAssetKey": "camp.supply", "failedRunId": old["runId"], "fallbackLimit": 1, "sources": {KEY: item}}
    request = {"prompt": item["prompt"], "original_request": "ViralInvasion_Microfront_v1 camp.supply authorized single GPT fallback after confirmed Seedream service failure " + old["runId"], "model": "gpt-image-2", "fallback_model": None, "canvas": catalog["canvas"], "folder_name": "项目大脑", "brain_root": r"D:\Workspace\Projects\xsj\SHJ-Product\项目大脑", "reference": item["reference"], "follow_up_node": item["follow_up_node"], "ratio": "1:1", "resolution": item["resolution"], "settings": item["settings"], "count": 1, "wait_seconds": 0, "poll_seconds": 5}
    write_new(catalog_path, new_catalog)
    write_new(request_path, request)
    result = subprocess.run([sys.executable, str(CLI), "generate", "--args-file", str(request_path)], capture_output=True, text=True, encoding="utf-8")
    if not result.stdout.strip():
        raise SystemExit("No receipt. Inspect written request; never replay. " + result.stderr[-1000:])
    response = json.loads(result.stdout)
    write_new(HERE / "responses" / (KEY + ".submit.json"), response)
    if not response.get("runId"):
        print(json.dumps(response, ensure_ascii=False), flush=True)
        raise SystemExit(1)
    data = response.get("data", {})
    status = data.get("status", response["status"])
    row = {"key": KEY, "canonicalAssetKey": "camp.supply", "failedRunId": old["runId"], "runId": response["runId"], "status": status, "responseStatus": response["status"], "manifestPath": response.get("manifestPath"), "canvas": data.get("canvas"), "images": response.get("images", []), "storage": data.get("storage", {}), "requestPath": str(request_path), "sourcePrompt": item["prompt"], "referenceNodes": data.get("referenceNodes", []), "followUpNodes": data.get("followUpNodes", [])}
    write_new(receipt_path, row)
    print(json.dumps({"key": KEY, "canonicalAssetKey": "camp.supply", "failedRunId": old["runId"], "runId": row["runId"], "status": status, "canvas": row["canvas"]}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
