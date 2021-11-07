export const pop = <K, V>(map: Map<K, V>, key: K) => {
  const value = map.get(key)
  map.delete(key)
  return value
}
