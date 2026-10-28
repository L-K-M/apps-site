// Standalone preview of the committed table art through Tiltburst's actual
// ArtRenderer, SdfBatch, shaders and table transform. No gameplay UI is invented.
#include "render/art_renderer.h"
#include "render/sdf_batch.h"
#include "render/tbart.h"
#include "render/view.h"
#include "table/sim_builder.h"
#include "table/table_loader.h"
#include <SDL3/SDL.h>
#include <stb_image_write.h>
#include <filesystem>
#include <cstdio>
#include <variant>
#include <vector>

int main(int argc, char** argv) {
    if (argc != 4) return 1;
    if (!SDL_Init(SDL_INIT_VIDEO)) { std::fprintf(stderr, "%s\n", SDL_GetError()); return 2; }
    SDL_GPUDevice* device = SDL_CreateGPUDevice(SDL_GPU_SHADERFORMAT_MSL, false, "metal");
    if (!device) { std::fprintf(stderr, "%s\n", SDL_GetError()); return 3; }
    constexpr uint32_t width = 800, height = 1600;
    SDL_GPUTextureCreateInfo texture_info{};
    texture_info.type = SDL_GPU_TEXTURETYPE_2D;
    texture_info.format = SDL_GPU_TEXTUREFORMAT_R8G8B8A8_UNORM;
    texture_info.usage = SDL_GPU_TEXTUREUSAGE_COLOR_TARGET;
    texture_info.width = width;
    texture_info.height = height;
    texture_info.layer_count_or_depth = 1;
    texture_info.num_levels = 1;
    auto* texture = SDL_CreateGPUTexture(device, &texture_info);
    tb::render::SdfBatch batch;
    if (!texture || !batch.init(device, texture_info.format, argv[2])) return 4;
    const auto table = tb::table::load_table(argv[1]);
    tb::sim::SimState scene;
    tb::table::build_sim(table, scene);
    std::vector<std::pair<std::string, int>> light_ids;
    for (size_t i = 0; i < table.elements.size(); ++i) {
        if (std::holds_alternative<tb::table::LightDef>(table.elements[i].def)) {
            light_ids.emplace_back(table.elements[i].id(), int(i));
        }
    }
    for (auto& light : scene.lights) light.on = true; // Fixed sample illumination.
    const auto loaded = tb::render::load_art(argv[1], light_ids);
    if (!loaded.loaded) return 5;
    tb::render::ArtRenderer art;
    art.set_art(&loaded.art);
    art.build(scene.lights.data(), scene.lights.size(), 0);
    batch.reserve(art.below_ball().size() + art.above_ball().size());
    float transform[16];
    tb::render::table_to_clip(tb::render::kReferenceTableW, tb::render::kReferenceTableH, transform);
    auto* command = SDL_AcquireGPUCommandBuffer(device);
    batch.begin_frame(command, transform, width, height, 0);
    for (const auto& instance : art.below_ball()) batch.push(instance);
    for (const auto& instance : art.above_ball()) batch.push(instance);
    SDL_GPUColorTargetInfo target{};
    target.texture = texture;
    target.clear_color = SDL_FColor{0.051f, 0.008f, 0.129f, 1};
    target.load_op = SDL_GPU_LOADOP_CLEAR;
    target.store_op = SDL_GPU_STOREOP_STORE;
    auto* pass = SDL_BeginGPURenderPass(command, &target, 1, nullptr);
    batch.upload_and_draw(pass);
    SDL_EndGPURenderPass(pass);
    SDL_SubmitGPUCommandBuffer(command);
    SDL_WaitForGPUIdle(device);

    SDL_GPUTransferBufferCreateInfo transfer_info{};
    transfer_info.usage = SDL_GPU_TRANSFERBUFFERUSAGE_DOWNLOAD;
    transfer_info.size = width * height * 4;
    auto* transfer = SDL_CreateGPUTransferBuffer(device, &transfer_info);
    auto* download = SDL_AcquireGPUCommandBuffer(device);
    auto* copy = SDL_BeginGPUCopyPass(download);
    SDL_GPUTextureRegion source{texture, 0, 0, 0, 0, 0, width, height, 1};
    SDL_GPUTextureTransferInfo destination{transfer, 0, width, height};
    SDL_DownloadFromGPUTexture(copy, &source, &destination);
    SDL_EndGPUCopyPass(copy);
    auto* fence = SDL_SubmitGPUCommandBufferAndAcquireFence(download);
    SDL_WaitForGPUFences(device, true, &fence, 1);
    SDL_ReleaseGPUFence(device, fence);
    void* bytes = SDL_MapGPUTransferBuffer(device, transfer, false);
    const bool wrote = bytes && stbi_write_png(argv[3], width, height, 4, bytes, width * 4);
    SDL_UnmapGPUTransferBuffer(device, transfer);
    SDL_ReleaseGPUTransferBuffer(device, transfer);
    batch.shutdown();
    SDL_ReleaseGPUTexture(device, texture);
    SDL_DestroyGPUDevice(device);
    SDL_Quit();
    return wrote ? 0 : 6;
}
