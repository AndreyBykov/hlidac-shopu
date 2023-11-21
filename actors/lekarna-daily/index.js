import { ActorType } from "@hlidac-shopu/actors-common/actor-type.js";
import { Actor, log } from "apify";
import rollbar from "@hlidac-shopu/actors-common/rollbar.js";
import { getInput, restPageUrls } from "@hlidac-shopu/actors-common/crawler.js";
import { withPersistedStats } from "@hlidac-shopu/actors-common/stats.js";
import { uploadToKeboola } from "@hlidac-shopu/actors-common/keboola.js";
import { HttpCrawler, useState } from "@crawlee/http";
import { parseHTML } from "@hlidac-shopu/actors-common/dom.js";
import { saveUniqProducts } from "@hlidac-shopu/actors-common/product.js";

const web = "https://www.lekarna.cz";

function extractItems({ products, breadCrumbs }) {
  return products
    .map(item => {
      const result = {};
      const itemUrl = item
        .querySelector("meta[itemprop=url]")
        .getAttribute("content");
      const name = item.querySelector("h2").textContent.trim();
      const cartBut = item.querySelector('input[name="productSkuId"]');
      let id;
      if (cartBut) {
        id = cartBut.getAttribute("value");
      } else if (item.querySelector("a[data-gtm]")) {
        const itemJsonObject = JSON.parse(
          item.querySelector("a[data-gtm]").getAttribute("data-gtm")
        );
        const products =
          itemJsonObject.ecommerce.click &&
          itemJsonObject.ecommerce.click.products
            ? itemJsonObject.ecommerce.click.products
            : [];
        const filteredProducts = products.filter(item =>
          item.variant.indexOf("Dlouhodobě nedostupný")
        );
        id = filteredProducts.length !== 0 ? filteredProducts[0].id : null;
      }

      const actualPriceSpan = item.querySelector("span[itemprop=price]");
      const oldPriceSpan = item.querySelector(
        "span.text-gray-500.line-through"
      );

      if (actualPriceSpan) {
        const itemImgUrl = item
          .querySelectorAll("picture source")
          .at(-1)
          .getAttribute("srcset");
        result.itemId = id;
        result.itemName = name;
        result.itemUrl = itemUrl.includes("https")
          ? itemUrl
          : `${web}${itemUrl}`;
        result.img = itemImgUrl;
        result.category = breadCrumbs;
        result.currentPrice = parseFloat(
          actualPriceSpan.getAttribute("content")
        );
        result.currency = item
          .querySelector("span[itemprop=priceCurrency]")
          .getAttribute("content");
        if (oldPriceSpan) {
          result.originalPrice = parseFloat(
            oldPriceSpan.textContent.replace("Kč", "").replace(/\s/g, "").trim()
          );
          result.discounted = true;
        } else {
          result.originalPrice = null;
          result.discounted = false;
        }
        return result;
      }
    })
    .filter(Boolean);
}

function extractBfItems(products) {
  return products
    .map(item => {
      const itemHeader = item.querySelector("h2 a");
      const itemOriginalPrice = item.querySelector(
        "p.items-center span.line-through"
      );
      const originalPrice = itemOriginalPrice
        ? parseFloat(
            itemOriginalPrice.textContent
              .replace("Kč", "")
              .replace(/\s/g, "")
              .trim()
          )
        : null;
      const itemJsonObject = JSON.parse(itemHeader.data.datalayer);
      if (!itemJsonObject) return;

      const [product] = itemJsonObject.ecommerce.products;
      const currentPrice = parseFloat(product.price);
      const itemUrl = itemHeader.getAttribute("href");
      const itemImgUrl = item.querySelector("picture img").getAttribute("src");

      if (parseFloat(product.price) <= 0) {
        return log.debug(`Skip product without price [${product.name}]`);
      }
      return {
        itemId: product.id,
        itemName: product.name,
        itemUrl: `https://lekarna.cz/${itemUrl}`,
        img: itemImgUrl,
        category: product.categories,
        currentPrice: currentPrice,
        originalPrice: originalPrice,
        discounted: originalPrice > currentPrice,
        currency: "CZK",
        inStock: product.availability === "InStock"
      };
    })
    .filter(Boolean);
}

function handleStart(document) {
  return document
    .querySelectorAll("nav.items-center > ul > li > span > a")
    .map(cat => ({
      url: cat.href,
      userData: { label: "PAGE" }
    }));
}

function handleSubCategory(document) {
  const getSubcategories = document.querySelectorAll(
    "#snippet--subcategories a"
  );
  const requests = [];
  for (const subCat of getSubcategories) {
    const url = subCat.href;
    if (!url.includes("?")) {
      requests.push({
        url: url.startsWith("https") ? url : `${web}${url}`,
        userData: { label: "PAGE" }
      });
    }
  }
  return requests;
}

function handlePagination({ document, request, type }) {
  const snippetListingClass =
    type === ActorType.Full
      ? "#snippet--productListing"
      : "#snippet--itemListing";
  const maxPage = document
    .querySelectorAll(
      `${snippetListingClass} ul.flex.flex-wrap.items-stretch li`
    )
    .at(-2)
    ?.textContent?.trim();

  return restPageUrls(maxPage, i => ({
    url: `${request.url}?strana=${i}`,
    userData: {
      label: "PAGI_PAGE",
      category: request.userData.category
    }
  }));
}

function handleProducts({ document, type }) {
  const itemListElements =
    type === ActorType.BlackFriday
      ? document.querySelectorAll("#snippet--productListItems div:has(> h2)")
      : document.querySelectorAll(
          '[itemprop="itemListElement"]:has(h2):has([itemprop=url])'
        );
  const breadCrumbs = document
    .querySelectorAll(
      "ul[itemtype='https://schema.org/BreadcrumbList'] [itemprop='name']"
    )
    .flatMap(item => {
      const breadCrumbs = [];
      const attrContent = item.getAttribute("content")?.trim();
      if (attrContent && attrContent !== "Úvodní strana") {
        breadCrumbs.push(attrContent);
      }

      const text = item.textContent?.trim();
      if (text) {
        breadCrumbs.push(text);
      }
      return breadCrumbs;
    })
    .join(" > ");

  return type === ActorType.Full
    ? extractItems({ products: itemListElements, breadCrumbs })
    : extractBfItems(itemListElements);
}

/**
 * @param {string} url
 * @param {ActorType} type
 */
export function getInitialUrls({ url, type }) {
  if (type === ActorType.BlackFriday) {
    const bfUrl = "https://www.lekarna.cz/blackfriday/";
    return [
      {
        url: bfUrl,
        label: "PAGE",
        userData: { category: bfUrl }
      }
    ];
  } else if (type === ActorType.Test) {
    return [
      {
        url: "https://www.lekarna.cz/masazni-pripravky/",
        label: "SUB_CATEGORY"
      }
    ];
  } else {
    return [{ url, label: "START" }];
  }
}

export async function main() {
  rollbar.init();

  const processedIds = useState("processedIds", {});

  const {
    development = false,
    debug = false,
    proxyGroups = ["CZECH_LUMINATI"],
    type = ActorType.Full
  } = await getInput();

  const stats = await withPersistedStats(x => x, {
    urls: 0,
    pages: 0,
    items: 0,
    itemsDuplicity: 0,
    failed: 0
  });

  if (development || debug) {
    log.setLevel(log.LEVELS.DEBUG);
  }

  const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: proxyGroups,
    useApifyProxy: !development
  });

  const crawler = new HttpCrawler({
    proxyConfiguration,
    maxRequestsPerMinute: development ? Infinity : 400,
    async requestHandler({ body, request, crawler, log }) {
      log.info(`Processing ${request.url}`);
      const { document } = parseHTML(body.toString());
      switch (request.userData.label) {
        case "START":
          {
            const requests = handleStart(document);
            stats.add("pages", requests.length);
            await crawler.requestQueue.addRequests(requests);
            log.info(`Enqueued ${requests.length} categories`);
          }
          break;
        case "PAGE":
          {
            const subCatReqs = handleSubCategory(document);
            stats.add("pages", subCatReqs.length);
            await crawler.requestQueue.addRequests(subCatReqs, {
              forefront: true
            });
            log.info(`Enqueued ${subCatReqs.length} subcategories`);
            const paginationReqs = handlePagination({
              document,
              request,
              type
            });
            log.info(`Found ${paginationReqs.length} pagination pages.`);
            await crawler.requestQueue.addRequests(paginationReqs, {
              forefront: true
            });
            const products = handleProducts({ document, type });
            const newProductsCount = await saveUniqProducts({
              products,
              stats,
              processedIds
            });
            stats.add("items", newProductsCount);
            log.info(`Found ${newProductsCount} unique products`);
          }
          break;
        case "PAGI_PAGE":
          {
            const products = handleProducts({ document, type });
            const newProductsCount = await saveUniqProducts({
              products,
              stats,
              processedIds
            });
            stats.add("items", newProductsCount);
            log.info(`Found ${newProductsCount} unique products`);
          }
          break;
        case "SUB_CATEGORY":
          {
            log.info(`START with sub category ${request.url}`);
            const requests = handleSubCategory(document);
            stats.add("pages", requests.length);
            await crawler.requestQueue.addRequests(requests, {
              forefront: true
            });
            log.info(`Enqueued ${requests.length} subcategories`);
          }
          break;
      }
    },
    async failedRequestHandler({ request, log }, error) {
      log.error(`Request ${request.url} failed multiple times`, error);
    }
  });

  await crawler.run(getInitialUrls({ url: web, type }));
  await stats.save(true);

  const tableName =
    type === ActorType.BlackFriday ? "lekarna_bf" : "lekarna_cz";
  await uploadToKeboola(tableName);
}
