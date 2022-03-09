export function alzaValidator(item) {
  const attributes = [
    "itemId",
    "itemCode",
    "itemUrl",
    "itemName",
    "currentPrice",
    "originalPrice",
    "discountedName",
    "breadCrumbs",
    "currency",
    "rating",
    "img",
    "inStock"
  ];
  for (const attr of attributes) {
    if (item[attr] === undefined) {
      item[attr] = null;
    }
  }

  return item;
}
