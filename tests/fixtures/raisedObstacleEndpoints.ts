// Minimal render inputs copied from the four genuine v0.6.3 selected screenshot endpoints.
// Kept in source so regression tests do not depend on local artifacts.
import type { ImmuneCellState } from '../../src/game/immuneCells';
export const raisedObstacleEndpoints: { browser: string; endpoint: string; tick: number; elapsed: number; cells: ImmuneCellState[] }[] = [
  {
    "browser": "chrome",
    "endpoint": "before",
    "tick": 465,
    "elapsed": 7.75,
    "cells": [
      {
        "id": "13:2:scan:446:beacon:cell:0",
        "x": 1622.690448941893,
        "y": 1004.0589482888655,
        "beaconId": "13:2:scan:446:beacon",
        "organId": "heart",
        "born": 7.433333333333334,
        "until": 13.433333333333334,
        "radius": 15,
        "facing": 1.1929948058162445,
        "damage": 8,
        "interval": 0.8,
        "updatedAt": 7.75,
        "attackReadyAt": 8.483333333333334,
        "attackUntil": 7.923333333333334,
        "targetId": "virus-4",
        "activity": "seeking",
        "navigationAt": 7.783333333333333,
        "waypoint": {
          "x": 1597.0214172737683,
          "y": 1040.9358944647156
        }
      },
      {
        "id": "13:2:scan:446:beacon:cell:1",
        "x": 1650.9854263437521,
        "y": 1021.7326277202571,
        "beaconId": "13:2:scan:446:beacon",
        "organId": "heart",
        "born": 7.433333333333334,
        "until": 13.433333333333334,
        "radius": 15,
        "facing": -2.986710967029322,
        "damage": 8,
        "interval": 0.8,
        "updatedAt": 7.75,
        "attackReadyAt": 7.763333333333334,
        "attackUntil": 0,
        "targetId": "virus-4",
        "activity": "seeking",
        "navigationAt": 7.783333333333333,
        "waypoint": {
          "x": 1631.8835728610284,
          "y": 981.0641139015013
        }
      },
      {
        "id": "13:2:scan:446:beacon:cell:2",
        "x": 1621.5320806508516,
        "y": 1037.399955895099,
        "beaconId": "13:2:scan:446:beacon",
        "organId": "heart",
        "born": 7.433333333333334,
        "until": 13.433333333333334,
        "radius": 15,
        "facing": -1.232110285389173,
        "damage": 8,
        "interval": 0.8,
        "updatedAt": 7.75,
        "attackReadyAt": 7.843333333333334,
        "attackUntil": 0,
        "targetId": "virus-4",
        "activity": "seeking",
        "navigationAt": 7.783333333333333,
        "waypoint": {
          "x": 1666.3029780049492,
          "y": 1041.1915165523612
        }
      }
    ]
  },
  {
    "browser": "chrome",
    "endpoint": "after",
    "tick": 475,
    "elapsed": 7.916666666666667,
    "cells": [
      {
        "id": "13:2:scan:446:beacon:cell:0",
        "x": 1622.690448941893,
        "y": 1004.0589482888655,
        "beaconId": "13:2:scan:446:beacon",
        "organId": "heart",
        "born": 7.433333333333334,
        "until": 13.433333333333334,
        "radius": 15,
        "facing": 1.5836765623751312,
        "damage": 8,
        "interval": 0.8,
        "updatedAt": 7.916666666666667,
        "attackReadyAt": 8.483333333333334,
        "attackUntil": 7.923333333333334,
        "targetId": "virus-4",
        "activity": "seeking",
        "navigationAt": 8.133333333333333,
        "waypoint": {
          "x": 1657.8423668065818,
          "y": 1042.8874779566268
        }
      },
      {
        "id": "13:2:scan:446:beacon:cell:1",
        "x": 1650.9854263437521,
        "y": 1021.7326277202571,
        "beaconId": "13:2:scan:446:beacon",
        "organId": "heart",
        "born": 7.433333333333334,
        "until": 13.433333333333334,
        "radius": 15,
        "facing": -2.8563982485431483,
        "damage": 8,
        "interval": 0.8,
        "updatedAt": 7.916666666666667,
        "attackReadyAt": 8.566666666666666,
        "attackUntil": 8.006666666666666,
        "targetId": "virus-4",
        "activity": "seeking",
        "navigationAt": 8.133333333333333,
        "waypoint": {
          "x": 1589.5907315037023,
          "y": 1030.9830973140756
        }
      },
      {
        "id": "13:2:scan:446:beacon:cell:2",
        "x": 1621.5320806508516,
        "y": 1037.399955895099,
        "beaconId": "13:2:scan:446:beacon",
        "organId": "heart",
        "born": 7.433333333333334,
        "until": 13.433333333333334,
        "radius": 15,
        "facing": -1.5275691791387274,
        "damage": 8,
        "interval": 0.8,
        "updatedAt": 7.916666666666667,
        "attackReadyAt": 8.65,
        "attackUntil": 8.09,
        "targetId": "virus-4",
        "activity": "seeking",
        "navigationAt": 8.133333333333333,
        "waypoint": {
          "x": 1634.026045207911,
          "y": 977.8276376132269
        }
      }
    ]
  },
  {
    "browser": "edge",
    "endpoint": "before",
    "tick": 477,
    "elapsed": 7.95,
    "cells": [
      {
        "id": "13:2:scan:458:beacon:cell:0",
        "x": 1623.2704830724092,
        "y": 997.6878309044259,
        "beaconId": "13:2:scan:458:beacon",
        "organId": "heart",
        "born": 7.633333333333333,
        "until": 13.633333333333333,
        "radius": 15,
        "facing": 1.083420579252577,
        "damage": 8,
        "interval": 0.8,
        "updatedAt": 7.95,
        "attackReadyAt": 8.683333333333334,
        "attackUntil": 8.123333333333333,
        "targetId": "virus-4",
        "activity": "seeking",
        "navigationAt": 7.9833333333333325,
        "waypoint": {
          "x": 1598.4685442707998,
          "y": 1028.8996366526167
        }
      },
      {
        "id": "13:2:scan:458:beacon:cell:1",
        "x": 1654.09950565577,
        "y": 1010.1379486016092,
        "beaconId": "13:2:scan:458:beacon",
        "organId": "heart",
        "born": 7.633333333333333,
        "until": 13.633333333333333,
        "radius": 15,
        "facing": -3.0762507247802975,
        "damage": 8,
        "interval": 0.8,
        "updatedAt": 7.95,
        "attackReadyAt": 7.963333333333333,
        "attackUntil": 0,
        "targetId": "virus-4",
        "activity": "seeking",
        "navigationAt": 7.9833333333333325,
        "waypoint": {
          "x": 1639.4702759432714,
          "y": 973.0528999542325
        }
      },
      {
        "id": "13:2:scan:458:beacon:cell:2",
        "x": 1627.9028651303488,
        "y": 1030.6115970125804,
        "beaconId": "13:2:scan:458:beacon",
        "organId": "heart",
        "born": 7.633333333333333,
        "until": 13.633333333333333,
        "radius": 15,
        "facing": -1.5212842855506976,
        "damage": 8,
        "interval": 0.8,
        "updatedAt": 7.95,
        "attackReadyAt": 8.043333333333333,
        "attackUntil": 0,
        "targetId": "virus-4",
        "activity": "seeking",
        "navigationAt": 7.9833333333333325,
        "waypoint": {
          "x": 1667.334102806297,
          "y": 1036.4848095309378
        }
      }
    ]
  },
  {
    "browser": "edge",
    "endpoint": "after",
    "tick": 488,
    "elapsed": 8.133333333333333,
    "cells": [
      {
        "id": "13:2:scan:458:beacon:cell:0",
        "x": 1623.2704830724092,
        "y": 997.6878309044259,
        "beaconId": "13:2:scan:458:beacon",
        "organId": "heart",
        "born": 7.633333333333333,
        "until": 13.633333333333333,
        "radius": 15,
        "facing": 1.7300453686237118,
        "damage": 8,
        "interval": 0.8,
        "updatedAt": 8.133333333333333,
        "attackReadyAt": 8.683333333333334,
        "attackUntil": 8.123333333333333,
        "targetId": "virus-4",
        "activity": "seeking",
        "navigationAt": 8.333333333333334,
        "waypoint": {
          "x": 1660.4170513427173,
          "y": 1030.7587971897005
        }
      },
      {
        "id": "13:2:scan:458:beacon:cell:1",
        "x": 1654.09950565577,
        "y": 1010.1379486016092,
        "beaconId": "13:2:scan:458:beacon",
        "organId": "heart",
        "born": 7.633333333333333,
        "until": 13.633333333333333,
        "radius": 15,
        "facing": -2.9432689404828944,
        "damage": 8,
        "interval": 0.8,
        "updatedAt": 8.133333333333333,
        "attackReadyAt": 8.766666666666667,
        "attackUntil": 8.206666666666667,
        "targetId": "virus-4",
        "activity": "seeking",
        "navigationAt": 8.333333333333334,
        "waypoint": {
          "x": 1591.433657880983,
          "y": 1024.3329566607474
        }
      },
      {
        "id": "13:2:scan:458:beacon:cell:2",
        "x": 1627.9028651303488,
        "y": 1030.6115970125804,
        "beaconId": "13:2:scan:458:beacon",
        "organId": "heart",
        "born": 7.633333333333333,
        "until": 13.633333333333333,
        "radius": 15,
        "facing": -1.7765013570457777,
        "damage": 8,
        "interval": 0.8,
        "updatedAt": 8.133333333333333,
        "attackReadyAt": 8.850000000000001,
        "attackUntil": 8.290000000000001,
        "targetId": "virus-4",
        "activity": "seeking",
        "navigationAt": 8.333333333333334,
        "waypoint": {
          "x": 1631.490295750591,
          "y": 967.8045057481046
        }
      }
    ]
  }
];
