import type { Request, Response } from 'express';
import { ok } from '../../common/http/respond';
import { requireUser } from '../../common/middleware/authenticate';
import type { UsersService } from './users.service';

export class UsersController {
  constructor(private readonly users: UsersService) {}

  me = async (req: Request, res: Response) => {
    ok(res, await this.users.getProfile(requireUser(req).id));
  };
}
