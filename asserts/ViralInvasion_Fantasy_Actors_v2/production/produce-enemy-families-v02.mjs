/** Source-specific mobile-readable revision. v01 candidates remain untouched. */
import { profiles as previous } from './produce-enemy-families.mjs';
import { produceEnemyFamily, rect as R, round as q, squashField as S, translateField as T, rotateField as A } from './enemy-family-production.mjs';
const full=R(0,0,512,512);
const phase=t=>[q(Math.cos(t*Math.PI*2)),q(Math.sin(t*Math.PI*2))];
const profiles={
 thinRay:{...previous.thinRay,revision:2,notes:previous.thinRay.notes+' v02 has visible20–30px membrane phases and a separately springing nozzle.',
 fieldsAt(t,m){const[c,s]=phase(t),p=[204,435.2];if(m==='walk')return[S(R(55,45,410,405),p,[1+.06*c,1-.085*c],64),T(R(176,183,254,232),[-8*s,0],76),A(R(270,261,177,166),[310,337],5*s,44),T(R(159,99,103,135),[5*s,-3*c],38),T(R(255,101,105,140),[-4*s,3*c],38)];if(m==='windup0')return[S(full,p,[1.07,.92],0),T(R(133,159,305,260),[12,0],80),S(R(267,260,181,165),[310,337],[.94,.98],48)];if(m==='windup1')return[S(full,p,[.96,1.07],0),S(R(267,260,181,165),[310,337],[1.11,1.07],48),T(R(282,272,165,154),[-9,0],46)];if(m==='hurt')return[S(full,p,[1.05,.94],0),T(R(130,157,307,259),[15,-1],82),A(R(268,261,178,165),[310,337],-7,47)];return[S(full,p,[.97,.96],0)];}},
 carapace:{...previous.carapace,revision:2,notes:previous.carapace.notes+' v02 rocks the rigid shell around its actual planted stalk by±6.5°, while separate plates counter-move; no rubber armour scaling.',
 fieldsAt(t,m){const[c,s]=phase(t),p=[198.5,435.2];if(m==='walk')return[A(full,p,6.5*s,0),T(R(89,52,313,219),[0,-3*c],50),A(R(225,119,151,166),[288,230],1.8*c,36),A(R(75,178,160,208),[163,290],-1.6*c,38),A(R(159,282,139,151),[226,353],1.4*s,35),A(R(330,203,116,211),[390,320],-1.4*s,36)];if(m==='windup0')return[A(full,p,-5.5,0),T(R(208,185,229,218),[5,-1],65),A(R(225,119,151,166),[288,230],-2,36)];if(m==='windup1')return[A(full,p,5.5,0),A(R(225,119,151,166),[288,230],2.8,37),T(R(316,172,133,238),[-4,1],43)];if(m==='hurt')return[A(full,p,-6,0),T(R(210,188,228,216),[8,0],68),A(R(75,178,160,208),[163,290],2.5,39)];return[A(full,p,2.5,0),S(full,p,[.993,.988],0)];}},
 'fission.parent':{...previous['fission.parent'],revision:2,notes:previous['fission.parent'].notes+' v02 visibly alternates lobe volume and connector tension rather than only membrane texture.',
 fieldsAt(t,m){const[c,s]=phase(t),p=[328,435.2],rear=R(36,106,268,275),front=R(159,162,300,289);if(m==='walk')return[S(full,p,[1+.045*c,1-.065*c],0),S(rear,[224,279],[1+.035*c,1-.03*c],62),T(rear,[10*s,-3*c],72),T(front,[-7*s,1.5*c],78),T(R(137,191,178,181),[-4*s,1*c],62)];if(m==='windup0')return[S(full,p,[1.055,.94],0),T(rear,[13,0],78),T(front,[-8,0],82)];if(m==='windup1')return[S(full,p,[.965,1.06],0),T(rear,[-9,-2],78),T(front,[-12,0],82)];if(m==='hurt')return[S(full,p,[1.035,.955],0),T(front,[13,0],82),T(rear,[3,0],78)];return[S(full,p,[.975,.965],0)];}},
 'fission.child':{
 family:'fission.child',revision:2,walkFrameMs:110,pins:[R(208,428,33,11)],contacts:[[225,435.2]],
 measurements:{bodyCenter:[251,320],faceCenter:[293,339],eyes:[[266,331],[334,320]],mouth:[300,362],topStalks:[[234,207],[309,212]],actualSoleLowestInk:[222,435,228,436]},
 notes:'Uses the exact small juvenile source with its own round body and small toothless mouth, not a scaled parent/basic replacement. v02 fast visible soft-body compression and side-stalk follow-through.',
 holes:[[172,301,10,14],[221,375,11,13],[296,397,11,10],[340,262,9,13],[350,367,9,10]],
 fieldsAt(t,m){const[c,s]=phase(t),p=[225,435.2];if(m==='walk')return[S(full,p,[1+.085*c,1-.11*c],0),T(R(194,248,193,161),[-7*s,-1*c],62),T(R(169,171,101,110),[5*s,-3*c],36),T(R(275,173,103,120),[-5*s,3*c],36)];if(m==='windup0')return[S(full,p,[1.09,.905],0),T(R(174,221,213,187),[9,0],69)];if(m==='windup1')return[S(full,p,[.94,1.085],0),T(R(179,220,209,189),[-10,0],70)];if(m==='hurt')return[S(full,p,[1.075,.92],0),T(R(175,220,211,188),[12,-1],70)];return[S(full,p,[.965,.955],0)];}
 },
 mimic:{
 family:'mimic',revision:2,walkFrameMs:160,pins:[R(204,428,34,11)],contacts:[[217.5,435.2]],
 measurements:{hoodCrown:[257,155],hoodOpening:[277,259],faceCenter:[283,329],leftDrapeHinge:[156,277],hemContact:[217.5,435.2],faceROI:R(190,222,209,190),drapeROI:R(60,136,187,304)},
 notes:'Uses corrected source revision2, with the baked pale rear shadow removed by source owner. Grey/grey-green drape rocks around measured planted hem; front face peeks independently without exposing invented hidden anatomy.',
 holes:[[132,252,10,16],[168,358,11,14],[227,386,10,11],[321,230,9,13],[362,347,10,12]],
 fieldsAt(t,m){const[c,s]=phase(t),p=[217.5,435.2];if(m==='walk')return[A(full,p,6*s,0),A(R(51,123,214,324),[202,235],2.3*c,58),T(R(186,211,226,212),[-7*s,-2*c],65),T(R(122,143,259,142),[2*s,-3*c],48)];if(m==='windup0')return[A(full,p,-5,0),T(R(182,210,232,214),[9,0],72),A(R(51,123,214,324),[202,235],-2,60)];if(m==='windup1')return[A(full,p,5,0),T(R(181,209,235,215),[-13,0],72),A(R(51,123,214,324),[202,235],2.5,60)];if(m==='hurt')return[A(full,p,-5.5,0),T(R(182,210,233,213),[12,0],73),A(R(51,123,214,324),[202,235],3,61)];return[A(full,p,2,0),S(full,p,[.984,.98],0)];}
 }
};
const requested=process.argv.slice(2);if(!requested.length)throw Error('Pass explicit family names');
for(const family of requested){if(!profiles[family])throw Error('No measured v02 profile:'+family);const f=await produceEnemyFamily(profiles[family]);console.log(JSON.stringify({family,revision:2,frames:8,fragment:`production/enemy.${family}.v02.fragment.json`,contact:f.contactSheets[0].path,mobile:f.clips[0].mobilePreview.path,motion:f.mobileMotionValidation}));}
