import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type JwtPayloadUser = {
  sub: string;
  pharmacyId: string;
  roles: string[];
  permissions: string[];
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayloadUser => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayloadUser }>();
    return request.user;
  },
);
