import{readFileSync,writeFileSync,existsSync}from'node:fs';
import{createHash}from'node:crypto';
const root='artifacts/completion-v073',hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(existsSync(root+'/visual-review.json'))throw Error('Preserve prior visual review.');
const full=root+'/browser/full-1/output/',targeted=root+'/browser/targeted-1/output/';
const checks=[
{path:full+'feedback-v060-Feedback-spa-af3e3-ll-patrol-and-paused-freeze-chrome/entry-district.png',observation:'Original actual entry image: facilities are distributed, open walkable ground and minimap/next objective visible. This camera shows a region, not the entire2400x1500 world; movement/camera change comes from separate actual DOM/snapshot assertions.'},
{path:full+'feedback-v061-growth-detai-7ae38--and-return-to-their-origin-chrome/advanced-build-details.png',observation:'Original short-window real build detail: beaconII,3 accepted bites,8-second duration,36 total squad damage,independent cooldown and costs readable. Lower placeholder clipped by deliberate scroll region; return button fixed. This screenshot does not show every detail section at once.'},
{path:full+'feedback-v060-Feedback-blo-1d9d1-gh-a-visible-advanced-build-chrome/draft-3.png',observation:'Original actual third draft: beaconII->III shows36->48 damage and8->10sec, new trace and resonance routes plus trigger/cost/action text. All three candidate cards readable. Three candidates remain one choice from four protocol routes.'},
{path:full+'feedback-v062-immune-reada-8a1be--and-a-clean-full-run-retry-chrome/immune-standard-readable.png',observation:'Original standard-effect real live cooperation: three highlighted bodies visible near marked crystal target, wider contact ring and trace priority readable; player/device are separate. Target, body rings and labels locally overlap. HUD says2 accepted bites; positive-hit/event assertions separately establish actual damage. Not every-frame separation.'},
{path:targeted+'feedback-v064-obstacle-vis-b01a4--then-win-and-retry-cleanly-edge/raised-fold-low-actual.png',observation:'Original low-effects real body proof near raised fold: cell bodies appear through faded upper silhouette and player/cell circles partly overlap. HUD bites0 at this body frame. Later same-squad accepted marked bite is independently proved; the PNG itself does not show that bite.'},
];
const additions=JSON.parse(readFileSync(root+'/visual-additions.json','utf8'));
checks.push(...additions);
for(const check of checks)check.sha256=hash(check.path);
const result={generatedAt:new Date().toISOString(),gameJsSha256:hash('dist/game.js'),method:'Primary agent inspected these exact unedited original PNGs with view_image. Observations distinguish actual pixels from separate read-only game/DOM/event evidence. No image editing or new state injection.',checks,
 scope:'Technical image review only. Not standardized five-player recognition, every-frame non-overlap, physical browser zoom or all-device readability.'};
writeFileSync(root+'/visual-review.json',JSON.stringify(result,null,2));console.log(JSON.stringify({inspected:checks.length}));
