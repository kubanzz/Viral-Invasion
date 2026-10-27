function beaconPosition(context: GrowthContext): Vec {
  const direction=normalized(context.aim.x-context.player.x,context.aim.y-context.player.y),length=Math.min(B.beaconPlacementRange,distance(context.player,context.aim));
  const wall=wallHit(context.player,direction,length,context.geometry);
  const travel=Math.max(0,Math.min(length,wall===null?length:wall-18));
  return point(moveWithCollision(context.player,{x:direction.x*travel,y:direction.y*travel},12,context.geometry));
}