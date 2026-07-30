<script setup lang="ts">
import { f7Block, f7BlockTitle, f7Link, f7Navbar, f7NavLeft, f7Page } from "framework7-vue";
</script>

<template>
  <f7Page name="detail">
    <f7Navbar title="Detail">
      <f7NavLeft>
        <f7Link back>Back</f7Link>
      </f7NavLeft>
    </f7Navbar>
    <f7BlockTitle>Drag from the absolute left edge</f7BlockTitle>
    <f7Block strong inset>
      Framework7 should move this page with your finger while revealing the previous page. A quick
      drag over 10 px commits; a slower drag must cross half the View width.
    </f7Block>
    <f7Block strong inset>
      The diagnostic panel is pointer-transparent. It shows raw touch coordinates separately from
      Framework7's accepted swipe-back progress.
    </f7Block>
    <div class="mx-4 mt-8 h-36 overflow-auto rounded-4 bg-white p-4 shadow-sm">
      <p class="m-0 font-semibold">Vertical-scroll control</p>
      <p v-for="line in 8" :key="line" class="mb-3 text-sm text-black/60">
        Scroll row {{ line }} — vertical movement should not trigger swipe-back.
      </p>
    </div>
  </f7Page>
</template>
