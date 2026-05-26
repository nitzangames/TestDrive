// Car model registry. Each builder returns a THREE.Group with the
// convention: origin = road-plane contact patch, front faces -Z, and
// group.userData.wheels = [4 wheel meshes (rotating)].

export { buildSedanModel }    from './sedan.js';
export { buildCompactModel }  from './compact.js';
export { buildCoupeModel }    from './coupe.js';
export { buildMinivanModel }  from './minivan.js';
export { buildCargovanModel } from './cargovan.js';
export { buildPickupModel }   from './pickup.js';
export { buildSportsModel }   from './sports.js';
export { buildSupercarModel } from './supercar.js';
export { buildSuvModel }      from './suv.js';
export { buildTruckModel }    from './truck.js';
export { buildKeitruckModel } from './keitruck.js';
export { buildFlatbedModel }  from './flatbed.js';

import { buildSedanModel }    from './sedan.js';
import { buildCompactModel }  from './compact.js';
import { buildCoupeModel }    from './coupe.js';
import { buildMinivanModel }  from './minivan.js';
import { buildCargovanModel } from './cargovan.js';
import { buildPickupModel }   from './pickup.js';
import { buildSportsModel }   from './sports.js';
import { buildSupercarModel } from './supercar.js';
import { buildSuvModel }      from './suv.js';
import { buildTruckModel }    from './truck.js';
import { buildKeitruckModel } from './keitruck.js';
import { buildFlatbedModel }  from './flatbed.js';

export const CAR_BUILDERS = {
  sedan:    buildSedanModel,
  compact:  buildCompactModel,
  coupe:    buildCoupeModel,
  minivan:  buildMinivanModel,
  cargovan: buildCargovanModel,
  pickup:   buildPickupModel,
  sports:   buildSportsModel,
  supercar: buildSupercarModel,
  suv:      buildSuvModel,
  truck:    buildTruckModel,
  keitruck: buildKeitruckModel,
  flatbed:  buildFlatbedModel,
};
