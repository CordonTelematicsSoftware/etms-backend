import { Op, col, fn, where } from 'sequelize';
import { UniqueValidationError } from '../interfaces/error';

export const uniqueCheck = async (
  modelName: any,
  fieldName: string,
  fieldValue: string,
  id?: string,
): Promise<UniqueValidationError> => {
  const whereClause: any = { [Op.and]: [] };

  // whereClause[fieldName] = where(
  //   fn('LOWER', col(fieldName)),
  //   Op.like,
  //   `${fieldValue?.trim()?.toLowerCase()}`,
  // );

  whereClause[Op.and].push({
    [fieldName]: where(
      fn('LOWER', col(fieldName)),
      Op.like,
      `${fieldValue?.trim()?.toLowerCase()}`,
    ),
  });

  whereClause[Op.and].push({
    [fieldName]: { [Op.ne]: '' },
  });
  whereClause[Op.and].push({
    [fieldName]: { [Op.ne]: null },
  });

  if (id) whereClause.id = { [Op.ne]: id };
  if (
    await modelName.findOne({
      where: whereClause,
    })
  )
    return Promise.resolve({ fieldName, error: true });
  else return Promise.resolve({ fieldName, error: false });
};

export const uniqueFieldsCheck = async (
  modelName: any,
  fields: string[],
  inputObject: any,
  id?: string,
  orgID?: string,
  vendorID?: string,
): Promise<any> => {
  const whereClause: any = { [Op.or]: [] };
  fields.map((field) => {
    if (inputObject?.[field])
      whereClause[Op.or].push({
        [Op.and]: [
          {
            [field]: where(
              fn('LOWER', col(field)),
              Op.like,
              `${inputObject?.[field]?.trim()?.toLowerCase()}`,
            ),
          },
          {
            [field]: { [Op.ne]: '' },
          },
          {
            [field]: { [Op.ne]: null },
          },
        ],
      });
  });
  if (id) whereClause.id = { [Op.ne]: id };
  if (orgID) whereClause.orgID = { [Op.eq]: orgID };
  if (vendorID) whereClause.vendorID = { [Op.eq]: vendorID };

  const data = await modelName.findOne({
    where: whereClause,
    attributes: fields,
  });

  return Promise.resolve(
    fields.map((fieldName) => {
      if (
        data &&
        inputObject?.[fieldName] &&
        data?.[fieldName]?.toLowerCase() ===
          inputObject?.[fieldName]?.toLowerCase()
      ) {
        return { fieldName, error: true };
      } else {
        return { fieldName, error: false };
      }
    }),
  );
};

export const uniqueCategoryCheck = async (
  modelName: any,
  fields: string[],
  inputObject: any,
  id?: string,
  orgID?: string,
  vendorID?: string,
): Promise<any> => {
  const whereClause: any = { [Op.or]: [] };
  fields.map((field) => {
    if (inputObject?.[field])
      whereClause[Op.or].push({
        [Op.and]: [
          {
            [field]: where(
              fn('LOWER', col(field)),
              Op.like,
              `${inputObject?.[field]?.trim()?.toLowerCase()}`,
            ),
          },
          {
            [field]: { [Op.ne]: '' },
          },
          {
            [field]: { [Op.ne]: null },
          },
        ],
      });
  });
  if (id) whereClause.id = { [Op.ne]: id };
  if (orgID) whereClause.orgId = { [Op.eq]: orgID };
  if (vendorID) whereClause.vendorID = { [Op.eq]: vendorID };

  const data = await modelName.findOne({
    where: whereClause,
    attributes: fields,
  });

  return Promise.resolve(
    fields.map((fieldName) => {
      if (
        data &&
        inputObject?.[fieldName] &&
        data?.[fieldName]?.toLowerCase() ===
          inputObject?.[fieldName]?.toLowerCase()
      ) {
        return { fieldName, error: true };
      } else {
        return { fieldName, error: false };
      }
    }),
  );
};
