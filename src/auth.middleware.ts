import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JellyfinAuthService } from './jellyfin-auth.service'; // You'll need to create this service

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private jellyfinAuthService: JellyfinAuthService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];

    if (!authHeader) return res.sendStatus(401);

    try {
      const isValid =
        await this.jellyfinAuthService.validateCredentials(authHeader);
      if (!isValid) {
        throw new UnauthorizedException('Invalid credentials');
      }
      next();
    } catch (error) {
      console.log(error);
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
