// Home page: small preview of the first gallery images. Decorative only;
// the "Zur Galerie" button remains the accessible way into the gallery.
import { loadData, element } from "./portal-data.js";

const preview = document.getElementById("homeGalleryPreview");
const localImage = (value) =>
  typeof value === "string" && value.startsWith("assets/img/gallery/") ? value : null;

try {
  const images = (await loadData("assets/data/gallery.json", "images"))
    .filter((image) => image && localImage(image.thumbnail || image.src))
    .slice(0, 3);
  for (const image of images) {
    const img = element("img", "");
    img.src = localImage(image.thumbnail) || localImage(image.src);
    img.alt = "";
    img.width = 320;
    img.height = 180;
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => img.remove(), { once: true });
    preview.append(img);
  }
  preview.hidden = !images.length;
} catch {
  preview.hidden = true;
}
