import { BadRequestException } from '@nestjs/common';
import { UniqueValidationError } from '../interfaces/error';
import { errorMessages } from './constants/error-messages';
import { SequelizeErrors } from '../enums';
export type Dict<T = any> = { [key: string]: T };

export const formatExceptions = (
  validationErrors: UniqueValidationError | UniqueValidationError[],
  type: string,
): Dict => {
  const errorObj: Dict = {};
  if (Array.isArray(validationErrors)) {
    validationErrors.forEach((validation) => {
      if (validation.error) {
        errorObj[validation.fieldName] =
          errorMessages[validation.fieldName][type];
      }
    });
  } else {
    if (validationErrors.error) {
      errorObj[validationErrors.fieldName] =
        errorMessages[validationErrors.fieldName][type];
    }
  }
  return errorObj;
};

export const handleErrors = (errors, type) => {
  const message = formatExceptions(errors, type);
  if (Object.keys(message).length) {
    throw new BadRequestException(message);
  }
};

export const formatUnhandledExceptions = (
  error: any,
): { error: Dict; isValidation: boolean } => {
  let errorObj: Dict = {};
  let isValidation = false;
  if (
    [SequelizeErrors.Validation, SequelizeErrors.Unhandled].indexOf(
      error.name,
    ) > -1
  ) {
    const sequelizeError = sequelizeErrorHandler(error);
    errorObj = sequelizeError.error;
    isValidation = sequelizeError.isValidation;
  } else {
    errorObj = { message: 'Something went wrong' };
  }

  return { error: errorObj, isValidation };
};

const sequelizeErrorHandler = (
  error: any,
): { error: Dict; isValidation: boolean } => {
  let validation = false;
  let errorObj: Dict = {};
  switch (error.name) {
    case SequelizeErrors.Validation:
      errorObj = formatSequelizeValidationError(error);
      validation = true;
      break;
    case SequelizeErrors.Unhandled:
      errorObj = { message: error.message };
      break;
    default:
      errorObj = { message: 'Something went wrong' };
  }
  return { error: errorObj, isValidation: validation };
};

const formatSequelizeValidationError = (error: any): Dict => {
  const errorObj: Dict = {};
  error?.errors?.forEach((error) => {
    errorObj[error.path] = errorMessages[error.path]['constraint'];
  });
  return errorObj;
};

export const handleRegexErrors = (errors, type) => {
  const message = formatExceptions(errors, type);
  const info = errors[0].info;
  if (Object.keys(message).length) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Password does not meet the required strength criteria.',
      errors: message,
      info: info,
    });
  }
};
