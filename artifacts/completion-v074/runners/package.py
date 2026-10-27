from pathlib import Path
import hashlib, json, subprocess, sys, zipfile

root = Path.cwd()
out = root / 'artifacts/completion-v074'
revision = sys.argv[1]
assert len(revision) == 40
frozen = json.loads((root / '.tools/v074-frozen.json').read_text(encoding='utf-8'))
meta = json.loads((root / 'dist/build-meta.json').read_text(encoding='utf-8'))
sha = lambda data: hashlib.sha256(data).hexdigest()
assert meta['version'] == '0.7.4'
assert sha((root / 'dist/game.js').read_bytes()) == frozen['gameSha256']
for name, digest in meta['sourceManifest'].items():
    data = (root / name).read_bytes()
    assert sha(data) == digest, name
    committed = subprocess.check_output(['git', 'show', revision + ':' + name])
    assert sha(committed) == digest, 'uncommitted: ' + name
folder = root / 'releases/Viral-Invasion-G4-v0.7.4'
archive = root / 'releases/Viral-Invasion-G4-v0.7.4.zip'
unpack = root / '.tools/release-v074-verify'
assert not folder.exists() and not archive.exists() and not unpack.exists(), 'Preserve earlier package'
files = {name: (root / 'dist' / name).read_bytes() for name in ['index.html', 'game.js', 'build-meta.json']}
files['README.txt'] = (f'''Viral Invasion · 病毒入侵
v0.7.4 / G4 试玩优化候选
源码提交 {revision}

完整解压到任意文件夹后，双击 Open-Game.cmd，或用 Chrome / Edge 打开 index.html。
本包完全离线运行，不需要服务器、账号或安装依赖。

WASD 移动 / 鼠标瞄准 / 左键使用工具 / Space 冲刺
1 精确净化 / 2 范围裂解与击退 / 3 组织修复
Q 扫描并召唤免疫细胞 / E 环境装置与交互 / Esc 暂停

体验建议：先清感染源，升级选择免疫灯塔，再向敌群按 Q，观察三只细胞接敌咬击。
灯塔配异常显影可优先围猎标记体；共振裂解配连锁净化可追加连锁。
已有协议可升至 II / III 阶；暂停菜单的当前配装详情显示数值和用法。
2400×1500 心肺战场可滚动探索，小地图标出分散设施、距离与镜头。
本版追加修正：进化战术记录与连锁命中标记只采用实际成功命中和真实伤害。

这是一份技术试玩候选。首玩节奏、趣味及复玩体验仍待真人观察。
''').replace('\n', '\r\n').encode('utf-8-sig')
files['Open-Game.cmd'] = b'@echo off\r\nstart "" "%~dp0index.html"\r\n'
folder.mkdir(parents=True)
for name, data in files.items():
    (folder / name).write_bytes(data)
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name, data in files.items():
        info = zipfile.ZipInfo(name, date_time=(1980,1,1,0,0,0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        z.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
unpack.mkdir(parents=True)
with zipfile.ZipFile(archive) as z:
    assert set(z.namelist()) == set(files), 'Unexpected ZIP entries'
    for name in files:
        assert Path(name).name == name
        data = z.read(name)
        assert data == files[name]
        (unpack / name).write_bytes(data)
record = dict(version='0.7.4', folder=folder.relative_to(root).as_posix(), revision=revision,
              sourceRevision=revision, packagingHead=subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip(),
              gameHash=frozen['gameSha256'], files={name:sha(data) for name,data in files.items()},
              zip=dict(path=archive.relative_to(root).as_posix(),bytes=archive.stat().st_size,sha256=sha(archive.read_bytes())),
              archiveTimestamps='1980-01-01 fixed ZIP metadata for reproducibility, not build/run time.')
(out / 'release-files.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
(out / 'release-unpack-validation.json').write_text(json.dumps({'pass':True, 'entries':list(files),
    'unpack':unpack.relative_to(root).as_posix(), 'allFiveFilesByteIdentical':True, 'zip':record['zip'],
    'scope':'Static whitelist extraction and byte comparison; browser smoke is separate.'},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(record['zip']))
