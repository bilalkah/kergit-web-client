<template>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-start lg:items-center">
    <div>
      <div class="text-indigo-300/80 tracking-widest text-[10px] sm:text-xs font-semibold mb-3">
        BIR ALAN DÜŞÜN...
      </div>
      <h1 class="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight text-slate-100">
        Konuş, paylaş<br />ve birlikte üret
      </h1>
      <p class="mt-4 sm:mt-5 text-sm sm:text-base lg:text-lg text-slate-300 max-w-xl">
        Ekipler ve topluluklar için gerçek zamanlı bir buluşma noktası.
        Fikirlerini paylaş, bağlı kal ve sohbeti web, masaüstü ve mobilde sürdür.
      </p>

      <div class="mt-5 sm:mt-6 flex flex-wrap gap-2">
        <span
          class="inline-flex items-center rounded-full px-3 py-1 text-[11px] sm:text-xs font-medium bg-white/5 border border-white/10 text-slate-200">Düşük gecikmeli
          mesajlaşma</span>
        <span
          class="inline-flex items-center rounded-full px-3 py-1 text-[11px] sm:text-xs font-medium bg-white/5 border border-white/10 text-slate-200">Güvenli
          oturumlar</span>
        <span
          class="inline-flex items-center rounded-full px-3 py-1 text-[11px] sm:text-xs font-medium bg-white/5 border border-white/10 text-slate-200">Gerçek zamanlı
          sunucular</span>
      </div>
    </div>

    <div
      class="w-full max-w-none justify-self-stretch sm:max-w-md sm:justify-self-center rounded-none border-0 bg-transparent p-0 sm:rounded-2xl sm:border sm:border-white/10 sm:bg-white/5 sm:backdrop-blur-xl sm:p-5">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-emerald-400/20 border border-emerald-300/20"></div>
        <div>
          <div class="font-semibold text-slate-100">Ekip Senkronu</div>
          <div class="text-xs text-slate-400">Şimdi canlı</div>
        </div>
      </div>

      <div class="space-y-3">
        <div class="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between">
          <div>
            <div class="font-semibold text-sm text-slate-100">Gidiş-dönüş pingi</div>
            <div class="text-xs text-slate-400">Stabil</div>
          </div>
          <span
            class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-emerald-400/10 border border-emerald-300/20 text-emerald-200">18
            ms</span>
        </div>

        <div class="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between">
          <div>
            <div class="font-semibold text-sm text-slate-100">Kanal güncellemeleri</div>
            <div class="text-xs text-slate-400">Otomatik senkron</div>
          </div>
          <span
            class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-white/5 border border-white/10 text-slate-200">Hazır</span>
        </div>

        <div class="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between">
          <div>
            <div class="font-semibold text-sm text-slate-100">Güvenli kimlik doğrulama</div>
            <div class="text-xs text-slate-400">Token tabanlı</div>
          </div>
          <span
            class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-indigo-500/10 border border-indigo-400/20 text-indigo-200">JWT</span>
        </div>
      </div>
    </div>
  </div>
</template>
