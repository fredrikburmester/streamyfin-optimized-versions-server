import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JellyfinAuthService {
  constructor(private configService: ConfigService) {}

  async validateCredentials(authHeader: string): Promise<boolean> {
    const jellyfinUrl = this.configService.get<string>('JELLYFIN_URL');
    try {
      const response = await axios.get(`${jellyfinUrl}/Users/Me`, {
        headers: { 'X-EMBY-TOKEN': authHeader },
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
