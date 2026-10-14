import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { PasswordHistory } from '../models/password-history.model';
import { GenericResponse } from 'src/shared/interfaces/generic-response';

@Injectable()
export class PasswordHistoryService {
  constructor(
    @InjectModel(PasswordHistory)
    private readonly passwordHistoryModel: typeof PasswordHistory,
  ) {}

  async findByEmployeeId(employeeID: bigint): Promise<PasswordHistory[]> {
    const history = await this.passwordHistoryModel.findAll({
      where: { employeeID },
      order: [['createdAt', 'DESC']],
    });
    // if (history.length == 0) {
    //   throw new BadRequestException(`Employee not found.`);
    // }
    return history;
  }

  async addPasswordHistory(
    hashedPassword: string,
    employeeID?: bigint,
    authID?: bigint,
    transaction?: any,
  ): Promise<GenericResponse<PasswordHistory>> {
    const history = await this.passwordHistoryModel.create(
      {
        employeeID,
        authID,
        hashedPassword,
        createdDate: new Date(),
      },
      { transaction },
    );
    return {
      message: 'Password history created successfully',
      data: history,
    };
  }
}
