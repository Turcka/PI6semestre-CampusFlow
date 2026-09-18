import { Router } from 'express';

import { requireRole } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as mapController from './map.controller.js';
import {
  createItinerarySchema,
  createPoiSchema,
  createRouteSchema,
  itineraryIdParamsSchema,
  poiIdParamsSchema,
  publicMapParamsSchema,
  routeIdParamsSchema,
  updateItinerarySchema,
  updatePoiSchema,
  updateRouteSchema,
} from './map.schemas.js';

export const mapRouter = Router();

const editors = requireRole('admin');

mapRouter.get('/pois', mapController.listPois);
mapRouter.post('/pois', editors, validate({ body: createPoiSchema }), mapController.createPoi);
mapRouter.patch('/pois/:id', editors, validate({ params: poiIdParamsSchema, body: updatePoiSchema }), mapController.updatePoi);
mapRouter.delete('/pois/:id', editors, validate({ params: poiIdParamsSchema }), mapController.deletePoi);

mapRouter.get('/routes', mapController.listRoutes);
mapRouter.post('/routes', editors, validate({ body: createRouteSchema }), mapController.createRoute);
mapRouter.patch(
  '/routes/:id',
  editors,
  validate({ params: routeIdParamsSchema, body: updateRouteSchema }),
  mapController.updateRoute,
);
mapRouter.delete('/routes/:id', editors, validate({ params: routeIdParamsSchema }), mapController.deleteRoute);

mapRouter.get('/itineraries', mapController.listItineraries);
mapRouter.post('/itineraries', editors, validate({ body: createItinerarySchema }), mapController.createItinerary);
mapRouter.patch(
  '/itineraries/:id',
  editors,
  validate({ params: itineraryIdParamsSchema, body: updateItinerarySchema }),
  mapController.updateItinerary,
);
mapRouter.delete(
  '/itineraries/:id',
  editors,
  validate({ params: itineraryIdParamsSchema }),
  mapController.deleteItinerary,
);

export const publicMapRouter = Router();
publicMapRouter.get('/:campusId', validate({ params: publicMapParamsSchema }), mapController.getPublicMap);
