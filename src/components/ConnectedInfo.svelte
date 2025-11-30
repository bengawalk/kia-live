<script lang="ts">
	import { connected, displayingTrip, connectedPopup } from '$lib/stores/discovery';
	import { messages } from '$lib/stores/language';
	$: isConnected = $displayingTrip ? Object.hasOwn($displayingTrip, 'vehicle_id') : $connected;
</script>
<!-- Top banner overlay (Mapbox-friendly) -->
<div
	class="pointer-events-none absolute inset-x-0 top-10 z-1 w-full flex items-stretch justify-center font-[500] font-[IBM_Plex_Sans] text-[14px]"
>
	<button
		class="pointer-events-auto flex cursor-pointer"
		on:click={() => connectedPopup.set(true)}
	>
		{#if !isConnected}
			<!-- Disconnected Bus / Server -->
			<div class="mt-[7px] mr-2 h-2 w-2 rounded-t-full rounded-b-full border-[2px] border-black"></div>
			<div class="text-black">
				{$messages.Disconnected()}
			</div>
		{/if}

		{#if isConnected}
			<!-- Connected Bus -->
			<div class="relative mt-[6px] mr-2 h-2 w-2 rounded-t-full rounded-b-full border-[2px] border-[#1967D3] overflow-visible">
				<!-- Ping ring (animation remains) -->
				<div class="absolute -inset-1 rounded-full border-[4px] border-[#1967D3] opacity-40 animate-ping origin-center"></div>
			</div>
			<div class="text-[#1967D3]">
				{$messages.Connected()}
			</div>
		{/if}
	</button>
</div>


{#if $connectedPopup}
	<!-- Overlay -->
	<div class="fixed inset-0 z-20 flex items-center justify-center bg-black/60" role="button" tabindex="-1" on:keydown={() => {}} on:click={() => connectedPopup.set(false)}>
		<!-- Modal -->
		<div class="text-[14px] font-medium font-[IBM_Plex_Sans] z-[21] { window.innerWidth > 700 ? 'w-1/2' : 'w-11/12' } max-w-[650px] rounded-[16px] bg-white p-6 shadow-[4px_4px_24px_#D9D9D9] flex flex-col gap-6">

			{#if isConnected}
				<!--	Connected popup -->
				<div class="flex w-full items-center">
					<div class="mt-[2px] mr-2 border-[2px] w-2 h-2 rounded-t-full rounded-b-full border-[#1967D3] bg-white">
						<div class="border-[4px] border-[#1967D3] w-2 h-2 rounded-t-full rounded-b-full -translate-1/4 animate-ping opacity-40" ></div>
					</div><!-- Pulsing Circle -->
					<div class="text-[#1967D3]">
						{$messages.Connected()}
					</div>
					<button class="ms-auto cursor-pointer" aria-label="Close" on:click={() => connectedPopup.set(false)}>
						<!-- X icon -->
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
							<path d="M15.7656 14.6336c.0743.0744.1332.1626.1735.2597.0402.0971.061.2012.061.3063s-.0208.204-.061.3011a.735.735 0 0 1-.1735.2597.735.735 0 0 1-.2597.1735.735.735 0 0 1-.3063.061.735.735 0 0 1-.3063-.061.735.735 0 0 1-.2597-.1735L8 9.13094 1.36637 15.7656A.735.735 0 0 1 .8004 16a.735.735 0 0 1-.565968-.2344A.735.735 0 0 1 0 15.1996c0-.2123.0843276-.4159.234432-.566L6.86906 8 .234432 1.36637A.8.8 0 0 1 0 .8004c0-.212279.0843276-.415864.234432-.566C.384536.0843276.588121 0 .8004 0c.21228 0 .41586.0843276.56597.234432L8 6.86906 14.6336.234432A.8.8 0 0 1 15.1996 0c.2123 0 .4159.0843276.566.234432.1501.150104.2344.353689.2344.565968 0 .21228-.0843.41586-.2344.56597L9.13094 8l6.63466 6.6336Z"/>
						</svg>
					</button>
				</div>

				<!-- Info / Description section -->
				<div class="flex-1 whitespace-pre-line text-black overflow-auto">
					You’re looking at the live positions of the BMTC airport buses.

					If you want to know more about this, go <a class="text-black-600 underline" href="github.com/bengawalk/kia-live/blob/main/README.md/" target="_blank">here</a>.
				</div>
			{/if}

			{#if !isConnected}
				<!--	Disconnected popup -->
				<!-- Top header -->
				<div class="flex w-full items-center">
					<div class="mt-[2px] mr-2 h-2 w-2 rounded-full border-2 border-black"></div>
					<div class="text-black">{$messages.Disconnected()}</div>
					<button class="ms-auto cursor-pointer" aria-label="Close" on:click={() => connectedPopup.set(false)}>
						<!-- X icon -->
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
							<path d="M15.7656 14.6336c.0743.0744.1332.1626.1735.2597.0402.0971.061.2012.061.3063s-.0208.204-.061.3011a.735.735 0 0 1-.1735.2597.735.735 0 0 1-.2597.1735.735.735 0 0 1-.3063.061.735.735 0 0 1-.3063-.061.735.735 0 0 1-.2597-.1735L8 9.13094 1.36637 15.7656A.735.735 0 0 1 .8004 16a.735.735 0 0 1-.565968-.2344A.735.735 0 0 1 0 15.1996c0-.2123.0843276-.4159.234432-.566L6.86906 8 .234432 1.36637A.8.8 0 0 1 0 .8004c0-.212279.0843276-.415864.234432-.566C.384536.0843276.588121 0 .8004 0c.21228 0 .41586.0843276.56597.234432L8 6.86906 14.6336.234432A.8.8 0 0 1 15.1996 0c.2123 0 .4159.0843276.566.234432.1501.150104.2344.353689.2344.565968 0 .21228-.0843.41586-.2344.56597L9.13094 8l6.63466 6.6336Z"/>
						</svg>
					</button>
				</div>

				<!-- Info / Description section -->
				<div class="flex-1 whitespace-pre-line text-black overflow-auto">
					We can’t track buses right now.

					The data you’re seeing is predictions based on previous journeys by the same buses on the same routes. Wait for sometime, we are working to establish the connection again.

					If you want to know more about this, go <a class="text-black-600 underline" href="github.com/bengawalk/kia-live/blob/main/README.md/" target="_blank">here</a>.
				</div>

			{/if}

		</div>
	</div>
{/if}