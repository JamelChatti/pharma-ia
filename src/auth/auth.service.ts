import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtAccessPayload } from './strategies/jwt.strategy';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    if (!dto.email && !dto.phone) {
      throw new UnauthorizedException(
        'Identifiants invalides — email ou téléphone requis',
      );
    }

    const orFilters: ({ email: string } | { phone: string })[] = [];
    if (dto.email) orFilters.push({ email: dto.email });
    if (dto.phone) orFilters.push({ phone: dto.phone });

    const user = await this.prisma.user.findFirst({
      where: {
        status: UserStatus.active,
        OR: orFilters,
      },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException('Identifiants invalides');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Identifiants invalides');

    const roles = [...new Set(user.userRoles.map((ur) => ur.role.code))];
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.code),
        ),
      ),
    ];

    const payload: JwtAccessPayload = {
      sub: user.id,
      pharmacyId: user.pharmacyId,
      roles,
      permissions,
    };

    const accessExpires =
      this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
    const refreshExpires =
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessExpires as JwtSignOptions['expiresIn'],
    });

    const refreshToken = await this.jwt.signAsync(
      {
        sub: user.id,
        pharmacyId: user.pharmacyId,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpires as JwtSignOptions['expiresIn'],
      },
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        pharmacyId: user.pharmacyId,
        roles,
        permissions,
      },
    };
  }
}
