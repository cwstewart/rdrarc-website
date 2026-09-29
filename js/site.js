const menu = document.querySelector("#menu");
const nav = document.querySelector("nav");
if (menu && nav) {
  const closeMenu = () => {
    nav.classList.remove("open");
    menu.setAttribute("aria-expanded", "false");
  };
  menu.addEventListener("click", () => {
    menu.setAttribute("aria-expanded", String(nav.classList.toggle("open")));
  });
  nav.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && nav.classList.contains("open")) {
      closeMenu();
      menu.focus();
    }
  });
}
document.querySelector("#year").textContent = `© ${new Date().getFullYear()}`;
