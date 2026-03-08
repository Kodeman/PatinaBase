import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';

export interface ProposalData {
  id: string;
  title: string;
  notes?: string;
  totalCost?: number;
  designerId: string;
  clientId: string;
  status: string;
  rooms?: Array<{
    id: string;
    name: string;
    type: string;
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      price: number;
    }>;
  }>;
  phases?: Array<{
    id: string;
    name: string;
    description?: string;
    startDate?: Date;
    endDate?: Date;
    cost?: number;
    deliverables?: string[];
  }>;
  items?: Array<{
    productId: string;
    quantity: number;
    customizations?: any;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ProposalsClientService {
  private readonly logger = new Logger(ProposalsClientService.name);
  private readonly baseUrl: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('PROPOSALS_SERVICE_URL', 'http://localhost:3020');
  }

  /**
   * Fetch proposal data for project creation
   */
  async getProposal(proposalId: string, token?: string): Promise<ProposalData | null> {
    try {
      const config: AxiosRequestConfig = {
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (token) {
        config.headers!['Authorization'] = `Bearer ${token}`;
      }

      const response = await firstValueFrom(
        this.httpService.get<ProposalData>(`${this.baseUrl}/proposals/${proposalId}`, config),
      );

      return (response as any)?.data || response;
    } catch (error) {
      this.logger.error(`Failed to fetch proposal ${proposalId}:`, error);

      // Return null if proposal service is unavailable
      // This allows project creation to continue without proposal data
      return null;
    }
  }

  /**
   * Mark proposal as converted to project
   */
  async markProposalConverted(proposalId: string, projectId: string, token?: string): Promise<void> {
    try {
      const config: AxiosRequestConfig = {
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (token) {
        config.headers!['Authorization'] = `Bearer ${token}`;
      }

      await firstValueFrom(
        this.httpService.patch(
          `${this.baseUrl}/proposals/${proposalId}/convert`,
          {
            projectId,
            convertedAt: new Date(),
            status: 'converted'
          },
          config,
        ),
      );

      this.logger.log(`Proposal ${proposalId} marked as converted to project ${projectId}`);
    } catch (error) {
      // Log but don't fail project creation if proposal update fails
      this.logger.error(`Failed to mark proposal ${proposalId} as converted:`, error);
    }
  }

  /**
   * Get proposals for a designer
   */
  async getDesignerProposals(
    designerId: string,
    status?: string,
    token?: string,
  ): Promise<ProposalData[]> {
    try {
      const config: AxiosRequestConfig = {
        headers: {
          'Content-Type': 'application/json',
        },
        params: {
          designerId,
          status,
        },
      };

      if (token) {
        config.headers!['Authorization'] = `Bearer ${token}`;
      }

      const response = await firstValueFrom(
        this.httpService.get<ProposalData[]>(`${this.baseUrl}/proposals`, config),
      );

      return (response as any)?.data || response;
    } catch (error) {
      this.logger.error(`Failed to fetch designer proposals:`, error);
      return [];
    }
  }

  /**
   * Check if proposal exists and is approved
   */
  async isProposalApproved(proposalId: string, token?: string): Promise<boolean> {
    try {
      const proposal = await this.getProposal(proposalId, token);
      return proposal?.status === 'approved';
    } catch (error) {
      return false;
    }
  }
}