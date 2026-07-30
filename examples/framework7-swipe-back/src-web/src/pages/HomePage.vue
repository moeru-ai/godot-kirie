<script setup lang="ts">
import { f7Block, f7BlockTitle, f7Button, f7Navbar, f7Page } from "framework7-vue";
</script>

<template>
  <f7Page name="home">
    <f7Navbar title="Swipe-back prototype" />
    <f7BlockTitle>Question under test</f7BlockTitle>
    <f7Block strong inset>
      Can Framework7 detect a gesture that starts at the physical left edge inside Kirie's
      full-screen WKWebView and use it to navigate back?
    </f7Block>
    <f7Block strong inset>
      <ol class="m-0 flex flex-col gap-2 pl-5">
        <li>Open the detail page to create real Framework7 router history.</li>
        <li>Start a drag in the leftmost 30 px and move right.</li>
        <li>Compare it with a drag that starts farther from the edge.</li>
      </ol>
    </f7Block>
    <f7Block>
      <f7Button fill large href="/detail/">Open detail page</f7Button>
    </f7Block>
  </f7Page>
</template>
