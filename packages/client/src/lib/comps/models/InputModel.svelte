<script lang="ts">
  import type { ModelProvider } from "@core/models";
  import { ProgressRing } from "@skeletonlabs/skeleton-svelte";
  import { Sparkles, CircleAlert } from "lucide-svelte/icons";
  import { providers } from "@core/providers";
  import { getActiveProviders } from "@core/customProviders";
  import { spaceStore } from "$lib/spaces/spaceStore.svelte";
  import {
    splitModelString,
    isValidModelString,
    getProviderId,
  } from "@core/utils/modelUtils";
  import { swins } from "$lib/swins";

  let { value = $bindable(), required }: { value: string; required?: boolean } =
    $props();

  let inputElement: HTMLInputElement;

  function onRequestChange() {
    swins.open(
      "select-model",
      {
        selectedModel: value,
        onModelSelect: (model: string) => {
          value = model;
        },
      },
      "Select Model"
    );
  }

  let providerId = $state("");
  let model = $state("");
  let provider = $state<ModelProvider | null>(null);
  let error = $state("");
  let allProviders = $state<ModelProvider[]>([]);

  // Load all providers including custom ones
  $effect(() => {
    if (spaceStore.currentSpace) {
      const customProviders =
        spaceStore.currentSpace.getCustomProviders() || [];
      allProviders = getActiveProviders(customProviders);
    } else {
      allProviders = [...providers];
    }
  });

  function validate() {
    if (required && !value) {
      error = "Choose a model";
      inputElement.setCustomValidity("Choose a model");
      return;
    }

    // Special case for auto
    if (value && value.startsWith("auto")) {
      error = "";
      inputElement.setCustomValidity("");
      return;
    }

    // Check if it's a valid format
    if (!isValidModelString(value)) {
      error = "Invalid model format: " + value;
      inputElement.setCustomValidity("Invalid model format: " + value);
      return;
    }

    // Get provider ID and check if it exists
    const provId = getProviderId(value);
    if (!provId || !allProviders.some((p) => p.id === provId)) {
      error = "Unknown provider: " + provId;
      inputElement.setCustomValidity("Unknown provider: " + provId);
      return;
    }

    error = "";
    inputElement.setCustomValidity("");
  }

  function onInputInvalid() {
    error = inputElement.validationMessage;
  }

  $effect(() => {
    update();
  });

  function update() {
    if (!value) {
      provider = null;
      providerId = "";
      model = "";
      validate();
      return;
    }

    // Parse the model string
    const modelParts = splitModelString(value);
    if (modelParts) {
      providerId = modelParts.providerId;
      model = modelParts.modelId;
    } else {
      // If invalid format, assume auto
      providerId = "auto";
      model = "";
    }

    if (providerId === "auto") {
      provider = null;
      providerId = "auto";
      model = "";
      validate();
      return;
    }

    // Find provider in all providers including custom ones
    provider = allProviders.find((p) => p.id === providerId) ?? null;
    validate();
  }
</script>

{#if !providerId || providerId === "auto"}
  <div class="input variant-form-material">
    <button
      type="button"
      class="flex p-2 gap-4 items-center cursor-pointer w-full"
      onclick={onRequestChange}
    >
      <div class="w-8 h-8 flex items-center justify-center rounded">
        <Sparkles size={18} />
      </div>
      <div class="">
        <span class="font-semibold">Auto</span>
      </div>
    </button>
  </div>
{:else if provider}
  <div class="input variant-form-material">
    <button
      type="button"
      class="flex p-2 gap-4 items-center cursor-pointer w-full"
      onclick={onRequestChange}
    >
      <div class="w-8 h-8 bg-white flex items-center justify-center rounded">
        <img class="w-5/6" src={provider.logoUrl} alt={provider.name} />
      </div>
      <div class="">
        <span class="font-semibold"
          >{provider.name}{model ? ` — ${model}` : ""}</span
        >
      </div>
    </button>
  </div>
{:else}
  <div class="input variant-form-material">
    <ProgressRing value={null} size="size-14" />
  </div>
{/if}
{#if error}
  <div class="flex intems-center mt-2 text-red-500 text-sm">
    <CircleAlert size={18} class="w-6 mr-2" /><span>{error}</span>
  </div>
{/if}
<input
  bind:this={inputElement}
  bind:value
  oninvalid={onInputInvalid}
  type="text"
  name="model"
  style="position: absolute; left: -9999px;"
  {required}
/>
