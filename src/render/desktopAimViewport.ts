import type {CameraViewport} from './camera';
import type {LabelRect} from './sceneLabels';

/** Derive one unobstructed central flight window from the same batched HUD
 * geometry used by world labels. No DOM reads or normal-combat camera policy. */
export function desktopAimViewport(width:number,height:number,rects:readonly LabelRect[]):CameraViewport{
  const gap=12,frame:CameraViewport={left:gap,right:width-gap,top:gap,bottom:height-gap};
  const usable=rects.filter(r=>[r.left,r.right,r.top,r.bottom].every(Number.isFinite)&&r.right>r.left&&r.bottom>r.top);
  for(const r of usable){
    const w=r.right-r.left,h=r.bottom-r.top;
    if(r.top<=height*.28&&h<=height*.35&&w>=Math.min(width*.42,600))frame.top=Math.max(frame.top,r.bottom+gap);
    if(r.bottom>=height*.9&&r.top>=height*.55&&w>=Math.min(width*.35,600))frame.bottom=Math.min(frame.bottom,r.top-gap);
    if(r.top>=height*.6&&r.bottom>=height*.75&&h<height*.2&&w>=Math.min(width*.24,500))frame.bottom=Math.min(frame.bottom,r.top-gap);
  }
  for(const r of usable){
    const w=r.right-r.left,h=r.bottom-r.top;
    if(h<60||w>width*.3||r.bottom<=frame.top||r.top>=frame.bottom)continue;
    if(r.left<=width*.16)frame.left=Math.max(frame.left,r.right+gap);
    if(r.right>=width*.84)frame.right=Math.min(frame.right,r.left-gap);
  }
  // An unusually crowded, short desktop still keeps the top HUD and dock
  // protected; side panels can yield horizontal framing before the body does.
  if(frame.right-frame.left<120){frame.left=gap;frame.right=width-gap;}
  if(frame.bottom-frame.top<80){frame.top=Math.min(height*.45,frame.top);frame.bottom=Math.max(height*.6,frame.bottom);}
  return frame;
}
