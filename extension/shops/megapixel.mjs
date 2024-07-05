import { cleanPrice, registerShop } from "../helpers.mjs";
import { Shop } from "./shop.mjs";

export class Megapixel extends Shop {
  get injectionPoint() {
    return ["beforebegin", "section.half-content-box"];
  }

  async scrape() {
    const elem = document.querySelector("div#snippet--price");
    if (!elem) return;
    const itemId = document.querySelector("[data-product-item-id]").getAttribute("data-product-item-id");
    const title = document.querySelector("h1").innerText.trim();
    const currentPrice = cleanPrice(".product-detail__price-vat");
    const originalPrice = cleanPrice(".product-detail__price del");
    const imageUrl = document.querySelector(".product-detail__main-img a").href;
    return { itemId, title, currentPrice, originalPrice, imageUrl };
  }
}

registerShop(new Megapixel(), "megapixel_cz");
