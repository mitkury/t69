<script lang="ts">
  import Settings from "lucide-svelte/icons/settings-2";
  import AppButtons from "./AppButtons.svelte";
  import AppTrees from "./AppTrees.svelte";
  import SpaceSelectorPopup from "../popups/SpaceSelectorPopup.svelte";
  import SwinsNavButton from "$lib/swins/SwinsNavButton.svelte";
  import SidebarToggle from "./SidebarToggle.svelte";
</script>

<div class="space-sidebar flex flex-col h-full">
  <div class="min-h-min py-2 px-2">
    <div class="flex items-center w-full gap-2 pb-3">
      <div class="flex-1 min-w-0">
        <SpaceSelectorPopup />
      </div>
      <div class="flex items-center">
        <SwinsNavButton component="settings" title="Settings" className="p-2 rounded hover:preset-tonal">
          <Settings size={18} />
        </SwinsNavButton>
        <SidebarToggle />
      </div>
    </div>
    <AppButtons />
  </div>
  <div class="flex-grow overflow-y-auto">
    <div class="px-2">
      <AppTrees />
    </div>
  </div>
</div>

<style>
  :global {
    .space-sidebar {
      background-color: var(--color-surface-100-900);
    }
  }
</style>
