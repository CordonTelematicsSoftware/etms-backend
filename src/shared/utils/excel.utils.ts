export function trimExcelRow(row: any) {
  return Object.keys(row).reduce((result, key) => {
    result[key] = typeof row[key] === 'string' ? row[key].trim() : row[key];

    return result;
  }, {});
}
