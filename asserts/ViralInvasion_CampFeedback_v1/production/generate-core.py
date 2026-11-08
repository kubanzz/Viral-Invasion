"""CampFeedback-only durable receipts. Resume never replays generation."""
from pathlib import Path
import argparse, hashlib, json, shutil, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
CLI = Path(r'D:\Workspace\Projects\xsj\SHJ-Product\项目大脑\工具箱\skills\maliang-skill\skills\maliang\scripts\maliang.py')
BRAIN = r'D:\Workspace\Projects\xsj\SHJ-Product\项目大脑'

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def main():
    p=argparse.ArgumentParser(); p.add_argument('operation',choices=['submit','resume']); p.add_argument('ids',nargs='+'); p.add_argument('--wait',type=int,default=0); p.add_argument('--catalog',default='prompt-catalog.json'); a=p.parse_args()
    cat=json.loads((ROOT/'production'/a.catalog).read_text(encoding='utf-8'))
    for key in a.ids:
        checkpoint=ROOT/'production'/'receipts'/(key+'.json')
        old=json.loads(checkpoint.read_text(encoding='utf-8')) if checkpoint.exists() else None
        requestPath=ROOT/'production'/'requests'/(key+'.'+a.operation+'.json')
        if a.operation=='submit':
            if old or requestPath.exists():
                print(json.dumps({'key':key,'status':'already-checkpointed','runId':(old or {}).get('runId'),'requestPath':str(requestPath)},ensure_ascii=False),flush=True); continue
            item=cat['sources'][key]
            request={'prompt':item['prompt'],'original_request':'ViralInvasion_CampFeedback_v1 '+key,'ratio':item.get('ratio','1:1'),'resolution':item.get('resolution','1K'),'settings':{'outputFormat':'png'},'count':1,'wait_seconds':a.wait,'poll_seconds':5,'folder_name':'项目大脑','brain_root':BRAIN}
            request.update({f:item[f] for f in ['reference','style_reference','follow_up_node','follow_up_run','settings'] if f in item})
            if cat.get('canvas'): request['canvas']=cat['canvas']
            else: request['create_canvas_title']='病毒入侵 · 血流接引悬浮光核 · 2026-11-06'
            command=['generate']
        else:
            if not old or not old.get('runId'): raise RuntimeError('Missing original run; do not replay')
            request={'run_id':old['runId'],'wait_seconds':a.wait,'poll_seconds':5}; command=['runs','resume']
        save(requestPath,request)
        result=subprocess.run([sys.executable,str(CLI)]+command+['--args-file',str(requestPath)],capture_output=True,text=True,encoding='utf-8')
        if not result.stdout.strip(): raise RuntimeError('No receipt. Inspect original request; never replay. '+result.stderr[-1000:])
        response=json.loads(result.stdout); save(ROOT/'production'/'responses'/(key+'.'+a.operation+'.json'),response)
        if not response.get('runId'):
            print(json.dumps(response,ensure_ascii=False),flush=True); raise SystemExit(1)
        data=response.get('data',{}); status=data.get('status',response['status'])
        row={'key':key,'runId':response['runId'],'status':status,'responseStatus':response['status'],'manifestPath':response.get('manifestPath'),'canvas':data.get('canvas'),'images':response.get('images',[]),'storage':data.get('storage',{}),'requestPath':str(requestPath),'sourcePrompt':cat['sources'][key]['prompt'],'referenceNodes':data.get('referenceNodes',[]),'followUpNodes':data.get('followUpNodes',[])}
        if status=='succeeded':
            row['raw']=[]
            for n,img in enumerate(row['images']):
                src=Path(img['path']); dest=ROOT/'raw'/key/(row['runId']+('' if n==0 else '-'+str(n))+'.png'); dest.parent.mkdir(parents=True,exist_ok=True)
                digest=hashlib.sha256(src.read_bytes()).hexdigest()
                if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest()!=digest: raise RuntimeError('Immutable raw mismatch')
                if not dest.exists(): shutil.copyfile(src,dest)
                row['raw'].append({'path':str(dest),'sha256':digest,'nodeId':img.get('nodeId')})
        save(checkpoint,row)
        print(json.dumps({'key':key,'runId':row['runId'],'status':status,'canvas':row['canvas'],'raw':row.get('raw',[]),'storageStatus':row['storage'].get('status')},ensure_ascii=False),flush=True)
        if status in ['submission_unknown','preparation_unknown']: raise SystemExit('Unknown external result; resume/read only')

if __name__=='__main__': main()


