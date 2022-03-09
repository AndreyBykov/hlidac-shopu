export function okayValidator(item) {
  const attributes = [
    "breadcrumb",
    "currency",
    "currentPrice",
    "discounted",
    "img",
    "inStock",
    "itemId",
    "itemName",
    "itemUrl",
    "originalPrice",
    "vatInfo",
    "blackFriday"
  ];
  for (const attr of attributes) {
    if (item[attr] === undefined) {
      item[attr] = null;
    }
  }

  return item;
}
