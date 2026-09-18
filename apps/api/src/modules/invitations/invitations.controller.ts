import type { Request, Response } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import * as invitationsService from './invitations.service.js';

export const listMe = asyncHandler(async (req: Request, res: Response) => {
  res.json(await invitationsService.listMyInvitations(req, req.query as never));
});

export const accept = asyncHandler(async (req: Request, res: Response) => {
  res.json(await invitationsService.acceptInvitation(req, req.params.id!));
});

export const decline = asyncHandler(async (req: Request, res: Response) => {
  res.json(await invitationsService.declineInvitation(req, req.params.id!, req.body));
});
