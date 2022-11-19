import { $ } from "zx";

export default async function () {
  await $`yarn db:prepare`;
}
