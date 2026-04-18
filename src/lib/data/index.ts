/**
 * Data module — star catalog loading, spatial indexing, color mapping, and notable object registry.
 */

export { loadStarCatalog, getStarPosition, searchStarsByName, getStarsBrighterThan } from './star-catalog';
export type { StarCatalog } from './star-catalog';

export { buildOctree, queryAABB, findNearest, getStarsForLOD } from './star-octree';
export type { StarOctree, AABB } from './star-octree';

export { bvToRGB, dequantizeBV, getColorLUT } from './bv-color';

export {
	parseSpectralType,
	estimateStellarProperties,
	bvToTemperature,
	formatDistance
} from './spectral-utils';
export type { SpectralInfo, StellarEstimates } from './spectral-utils';

export {
	loadNotableObjects,
	searchNotableObjects,
	getObjectsByType,
	findNearestObject
} from './notable-objects';
export type { NotableObjectCatalog } from './notable-objects';

export {
	loadSolarSystem,
	getBodyById,
	getBodyByNaifId,
	getBodiesByType,
	getChildren,
	getSatelliteById,
	getSatellitesBySubtype,
	searchSolarSystem
} from './solar-system';
export type { SolarSystemCatalog } from './solar-system';

export { fetchNasaImage } from './nasa-images';
export type { NasaImageResult, NasaImageFetchStatus } from './nasa-images';

export { loadConstellations } from './constellations';
export type { ConstellationData, Constellation } from './constellations';

export { fetchExoplanets, resolveHostname } from './exoplanets';

export {
	loadTleSnapshot,
	fetchTleBatch,
	fetchTleFromCelesTrak,
	parse3LE,
	tleEpochToJD,
	isTleStale,
	formatTleAge
} from './celestrak';
export type { TleData, TleSnapshot, TleFetchStatus } from './celestrak';

export type {
	StarCatalogData, StarCatalogMeta, NotableStar, StarCategory, RGB,
	NotableObject, NotableObjectType, NotableObjectRegistry,
	NebulaNO, ClusterNO, BlackholeNO, PulsarNO, MagnetarNO, VariableStarNO,
	SolarSystemBody, SolarSystemBodyType, Satellite, SatelliteSubtype,
	SatelliteOrbitType, SolarSystemRegistry, Atmosphere, RingSystem,
	HeliocentricState, SurfaceMarker,
	Exoplanet, ExoplanetSystem, ExoplanetFetchStatus
} from './types';
