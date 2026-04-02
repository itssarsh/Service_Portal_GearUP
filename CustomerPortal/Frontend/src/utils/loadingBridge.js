let showLoaderHandler = null;
let hideLoaderHandler = null;

function registerLoaderHandlers(handlers) {
  showLoaderHandler = handlers?.show ?? null;
  hideLoaderHandler = handlers?.hide ?? null;
}

function startGlobalLoading() {
  if (showLoaderHandler) {
    showLoaderHandler();
  }
}

function stopGlobalLoading() {
  if (hideLoaderHandler) {
    hideLoaderHandler();
  }
}

export { registerLoaderHandlers, startGlobalLoading, stopGlobalLoading };
