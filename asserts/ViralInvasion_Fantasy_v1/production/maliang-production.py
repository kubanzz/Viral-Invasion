"""Project-local orchestration of the established Maliang Engine; no runtime edits."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import sys

sys.path.insert(0, r'D:\project\xsj\SHJ-Product\项目大脑\工具箱\skills\maliang-skill\src')
from maliang import legacy as api
from maliang.common import atomic_json, redact_text
from maliang.engine import Engine
from maliang.models import Generate

ROOT=Path(__file__).resolve().parents[1]
REGISTRY=ROOT/'production'/'runs.json'
REFERENCE=Path(r'C:\Users\SEASUN\.codex\generated_images\01a19ce0-dc23-7673-a586-810d16380fa0\exec-d92f546e-b3a9-4c4d-b690-3022f61bf94f.png')
REFERENCE_HASH='8caaa9cabe4a229f6a091360f642436bc021cf03aafed4111e173760aafdfabe'
TOKEN='ViralInvasion_Fantasy_v1 production '

def read_registry():
    return json.loads(REGISTRY.read_text(encoding='utf-8')) if REGISTRY.exists() else {'schemaVersion':1,'reference':{'path':str(REFERENCE),'sha256':REFERENCE_HASH},'runs':{}}

def catalog():
    value=json.loads((ROOT/'production'/'prompt-catalog.json').read_text(encoding='utf-8-sig'))
    items=value.get('assets',value.get('prompts',[])) if isinstance(value,dict) else value
    return {item['id']:item for item in items}

class ProductionEngine(Engine):
    def __init__(self,registry):
        super().__init__()
        self.registry=registry

    def _attempt(self,manifest,request,model_id,label,models,settings,references,follows):
        node_id=self.registry.get('referenceNodeId')
        if node_id and not references:
            reference=api.restore_uploaded_reference(self.client,manifest['canvas']['id'],node_id,'style',REFERENCE.name)
            references=[reference]
            if not any(r.get('nodeId')==node_id for r in manifest['referenceNodes']):
                manifest['referenceNodes'].append({'nodeId':node_id,'role':'style','originalName':REFERENCE.name,'reusedFromRun':self.registry['referenceRunId']})
                self._save(manifest)
        return super()._attempt(manifest,request,model_id,label,models,settings,references,follows)

def remember(registry,asset_id,response):
    manifest=response.get('data',{})
    run=registry['runs'].setdefault(asset_id,{})
    run.update(runId=response['runId'],status=manifest.get('status',response['status']),responseStatus=response['status'],manifestPath=response.get('manifestPath'),canvas=manifest.get('canvas'),images=response.get('images',[]),storage=manifest.get('storage',{}),attempts=[{'model':a.get('modelLabel'),'status':a.get('status')} for a in manifest.get('attempts',[])])
    if manifest.get('canvas',{}).get('id'):
        registry['canvasId']=manifest['canvas']['id']
    if not registry.get('referenceNodeId') and manifest.get('referenceNodes'):
        registry['referenceNodeId']=manifest['referenceNodes'][0]['nodeId']
        registry['referenceRunId']=response['runId']
    if manifest.get('status')=='succeeded':
        raw_dir=ROOT/'raw'/asset_id
        raw_dir.mkdir(parents=True,exist_ok=True)
        raw=[]
        for item in response.get('images',[]):
            source=Path(item['path'])
            target=raw_dir/(response['runId']+source.suffix)
            if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()!=item['sha256']:
                raise RuntimeError('Refusing to overwrite a changed production original')
            if not target.exists():
                shutil.copyfile(source,target)
            raw.append({'path':target.relative_to(ROOT).as_posix(),'sha256':item['sha256'],'nodeId':item['nodeId']})
        run['raw']=raw
    atomic_json(REGISTRY,registry)
    print(json.dumps({'id':asset_id,'runId':response['runId'],'status':run['status'],'responseStatus':response['status'],'raw':run.get('raw',[])},ensure_ascii=False),flush=True)

def parent_id(asset_id):
    special={'healingNode.infected':'healingNode.healthy','healingNode.recovering':'healingNode.healthy','heart.valve.open':'heart.valve.closed','lung.airway.open':'lung.airway.closed'}
    return special.get(asset_id,asset_id[:-len('.infected')]+'.healthy' if asset_id.endswith('.infected') else None)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('operation',choices=['submit','resume','collect','status'])
    parser.add_argument('ids',nargs='*')
    parser.add_argument('--wait',type=int,default=0)
    parser.add_argument('--revision',type=int,default=1)
    args=parser.parse_args()
    registry=read_registry()
    engine=ProductionEngine(registry)
    if args.operation=='status':
        print(json.dumps(registry,ensure_ascii=False));return
    ids=args.ids or list(registry['runs'])
    prompts=catalog() if args.operation=='submit' else {}
    for asset_id in ids:
        try:
            if args.operation=='submit':
                if asset_id in registry['runs']:
                    previous=registry['runs'][asset_id]
                    if args.revision<=previous.get('revision',1):
                        print(json.dumps({'id':asset_id,'status':'already_recorded','runId':previous['runId']}),flush=True);continue
                    if previous.get('status') not in {'succeeded','failed','preparation_failed'}:
                        raise RuntimeError('Revision blocked until original external result is settled')
                    history=previous.get('history',[])+[{k:v for k,v in previous.items() if k!='history'}]
                    registry['runs'][asset_id]={'revision':args.revision,'history':history,'status':'revision-preparing'}
                    atomic_json(REGISTRY,registry)
                # Reconcile a prior command interrupted after Engine saved its run.
                existing=[]
                for row in engine.store.list():
                    m=engine.store.load(row['runId'])
                    if m.get('request',{}).get('original_request')==TOKEN+asset_id+(f' revision {args.revision}' if args.revision>1 else ''):
                        existing.append(m)
                if existing:
                    if len(existing)!=1: raise RuntimeError('Ambiguous pre-existing production run')
                    remember(registry,asset_id,engine.status(existing[0]['runId'],refresh=False));continue
                item=prompts[asset_id]
                parent=parent_id(asset_id)
                values={'prompt':item['prompt'],'original_request':TOKEN+asset_id+(f' revision {args.revision}' if args.revision>1 else ''),'ratio':'1:1','resolution':'2K','settings':{'outputFormat':'png'},'count':1,'wait_seconds':args.wait,'poll_seconds':5.0,'folder_name':'项目大脑','brain_root':r'D:\project\xsj\SHJ-Product\项目大脑'}
                if parent:
                    p=registry['runs'].get(parent,{})
                    if p.get('status')!='succeeded': raise RuntimeError('Parent is not ready: '+parent)
                    values['follow_up_run']=p['runId']
                if registry.get('canvasId'):
                    values['canvas']=registry['canvasId']
                else:
                    values['create_canvas_title']='病毒入侵 · Fantasy_v1 场景模块 · 2026-11-03'
                if not registry.get('referenceNodeId'):
                    if hashlib.sha256(REFERENCE.read_bytes()).hexdigest()!=REFERENCE_HASH: raise RuntimeError('Approved reference hash mismatch')
                    values['style_reference']=[str(REFERENCE)]
                request_path=ROOT/'production'/'requests'/(asset_id+(f'.r{args.revision:02}' if args.revision>1 else '')+'.json')
                atomic_json(request_path,values)
                response=engine.generate(Generate.model_validate(values))
            else:
                response=engine.resume(registry['runs'][asset_id]['runId'],wait_seconds=args.wait,poll_seconds=5.0)
            remember(registry,asset_id,response)
            if response['status'] in {'submission_unknown','preparation_unknown'}:
                raise RuntimeError('Unknown external result; stopped without replay')
        except Exception as error:
            print(json.dumps({'id':asset_id,'error':redact_text(error),'details':getattr(error,'details',{})},ensure_ascii=False),flush=True)
            raise SystemExit(1)

if __name__=='__main__':
    main()
