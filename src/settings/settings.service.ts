import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { Settings } from './models/settings.model';
import { Sequelize } from 'sequelize-typescript';
import { Transaction } from 'sequelize';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Settings)
    private settingsModel: typeof Settings,
    private readonly sequelize: Sequelize,
  ) {}
  async getValue(key: string): Promise<GenericResponse<Settings>> {
    const getValue = await this.settingsModel.findOne({
      where: { key },
    });

    return {
      data: getValue,
      message: 'Setting value',
      status: true,
    };
  }

  async setValue(
    setValue: Settings,
    incrementedValue: string,
    transaction?: Transaction,
  ): Promise<GenericResponse<Settings>> {
    if (incrementedValue) {
      await setValue.update({ value: incrementedValue }, { transaction });

      return {
        data: setValue,
        message: 'New Incremented Set Value',
        status: true,
      };
    } else {
      return {
        data: null,
        message: 'Value not found',
        status: false,
      };
    }
  }

  async getNext(key: string, transaction?: Transaction): Promise<any> {
    const setValue = await Settings.findOne({
      where: { key },
    });
    const currentValue = parseInt(setValue.value);
    const incrementedValue = currentValue + 1;
    const newValue = incrementedValue.toString().padStart(3, '0');
    const newCode = await this.setValue(setValue, newValue, transaction);
    return newCode.data ?? null;
  }
}
