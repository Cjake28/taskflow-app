import type { UserDto } from '@taskflow/shared';
import { NotFoundException } from '../../common/exceptions';
import type { Db } from '../../database/prisma';
import { toUserResponse } from './users.mapper';

export class UsersService {
  constructor(private readonly prisma: Db) {}

  async getProfile(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      omit: { passwordHash: false },
    });
    if (!user) throw new NotFoundException('User');
    return toUserResponse(user);
  }
}
