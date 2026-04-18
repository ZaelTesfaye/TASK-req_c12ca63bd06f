<script>
  let { maxSize = 25 * 1024 * 1024, allowedTypes = [], multiple = true, onUpload } = $props();
  let files = $state([]);
  let dragOver = $state(false);

  const ALLOWED_MIME = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'];

  function validateFile(file) {
    const errors = [];
    if (file.size > maxSize) errors.push(`File exceeds ${(maxSize / (1024 * 1024)).toFixed(0)}MB limit`);
    const allowed = allowedTypes.length > 0 ? allowedTypes : ALLOWED_MIME;
    if (!allowed.includes(file.type)) errors.push('File type not allowed');
    return errors;
  }

  function handleFiles(rawFiles) {
    const newFiles = Array.from(rawFiles).map(f => {
      const errors = validateFile(f);
      return { file: f, name: f.name, size: f.size, type: f.type, errors, status: errors.length ? 'invalid' : 'ready' };
    });
    files = multiple ? [...files, ...newFiles] : newFiles.slice(0, 1);
  }

  function handleDrop(e) {
    e.preventDefault();
    dragOver = false;
    handleFiles(e.dataTransfer.files);
  }

  function handleInput(e) { handleFiles(e.target.files); }

  function removeFile(idx) { files = files.filter((_, i) => i !== idx); }

  async function uploadAll() {
    const validFiles = files.filter(f => f.status === 'ready');
    for (const f of validFiles) {
      f.status = 'uploading';
      files = [...files];
      try {
        if (onUpload) await onUpload(f.file);
        f.status = 'success';
      } catch (err) {
        f.status = 'error';
        f.errors = [err.message || 'Upload failed'];
      }
      files = [...files];
    }
  }

  const hasReady = $derived(files.some(f => f.status === 'ready'));

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
</script>

<div>
  <!-- Drop Zone -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="border-2 border-dashed rounded-xl p-8 text-center transition-colors {dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}"
    ondrop={handleDrop}
    ondragover={(e) => { e.preventDefault(); dragOver = true; }}
    ondragleave={() => dragOver = false}
  >
    <p class="text-gray-500 mb-2">Drag & drop files here</p>
    <label class="text-blue-600 hover:underline cursor-pointer text-sm font-medium">
      Browse files
      <input type="file" {multiple} class="hidden" onchange={handleInput} accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.gif,.webp" />
    </label>
    <p class="text-xs text-gray-400 mt-2">Max {(maxSize / (1024 * 1024)).toFixed(0)}MB · PDF, DOCX, XLSX, PNG, JPG, GIF, WebP</p>
  </div>

  <!-- File List -->
  {#if files.length > 0}
    <div class="mt-4 space-y-2">
      {#each files as f, i}
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div class="flex items-center gap-3 min-w-0">
            <span class="text-lg">{f.type?.startsWith('image/') ? '🖼' : '📄'}</span>
            <div class="min-w-0">
              <p class="text-sm font-medium truncate">{f.name}</p>
              <p class="text-xs text-gray-400">{formatSize(f.size)}</p>
              {#if f.errors?.length}
                {#each f.errors as err}<p class="text-xs text-red-500">{err}</p>{/each}
              {/if}
            </div>
          </div>
          <div class="flex items-center gap-2">
            {#if f.status === 'uploading'}
              <span class="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
            {:else if f.status === 'success'}
              <span class="text-green-600 text-sm">✓</span>
            {:else if f.status === 'error' || f.status === 'invalid'}
              <span class="text-red-600 text-sm">✗</span>
            {/if}
            <button onclick={() => removeFile(i)} class="text-gray-400 hover:text-red-500 text-sm">✕</button>
          </div>
        </div>
      {/each}
    </div>
    {#if hasReady}
      <button onclick={uploadAll} class="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Upload All</button>
    {/if}
  {/if}
</div>
