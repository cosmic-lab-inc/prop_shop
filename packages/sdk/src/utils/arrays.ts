export function chunkArray<T>(arrayToChunk: T[], chunkSize = 100): T[][] {
  return arrayToChunk.reduce<T[][]>((resultArray, item, index) => {
    const chunkIndex = Math.floor(index / chunkSize);

    if (!resultArray[chunkIndex]) {
      resultArray[chunkIndex] = [];
    }

    resultArray[chunkIndex].push(item);

    return resultArray;
  }, []);
}
