import { Dict } from '../interfaces/generics';
import { hasWhiteSpace } from './string-utils';

export const generateSearchText = (
  data: Dict,
  searchFields: string[],
): string => {
  let searchString = '';
  searchFields.forEach((field) => {
    if (typeof data[field] === 'string') {
      searchString += `${data[field]?.toLowerCase().trim()} `;
    } else if (data[field] instanceof Date) {
      searchString +=
        new Date(data[field]).toLocaleDateString('en-GB', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }) + ' ';
    } else {
      searchString += `${data[field]} `;
    }
  });
  return searchString;
};

export const generateVector = (searchQuery: string): string => {
  let searchVector = '';
  let searchArray: string[] = [];
  const filteredArray = [];
  if (hasWhiteSpace(searchQuery)) {
    searchArray = searchQuery.split(' ');
    searchArray.forEach((query) => {
      if (query.trim().length > 0) {
        filteredArray.push(query);
      }
    });
    searchVector = filteredArray.join(':* | ');
    searchVector += ':*';
  } else {
    searchVector = searchQuery + ':*';
  }

  return searchVector.trim();
};

export const generateVectorOld = (searchQuery: string): string => {
  let searchVector: string = hasWhiteSpace(searchQuery)
    ? searchQuery.split(' ').join(':* | ')
    : searchQuery + ':*';
  if (!searchVector.endsWith(':*')) {
    searchVector += ':*';
  }
  return searchVector;
};
