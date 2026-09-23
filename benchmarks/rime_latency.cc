// Use a disposable profile. No personal dictionary is read or modified.
#include <rime_api.h>
#include <dlfcn.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <chrono>
#include <string>
#include <thread>

using Clock = std::chrono::steady_clock;
int main(int argc, char** argv) {
  if (argc < 3) return 1;
  const int gap_ms = argc > 3 ? std::atoi(argv[3]) : 0;
  dlopen("/Library/Input Methods/Squirrel.app/Contents/Frameworks/rime-plugins/librime-lua.dylib", RTLD_NOW | RTLD_GLOBAL);
  auto* api = rime_get_api();
  RIME_STRUCT(RimeTraits, traits);
  traits.shared_data_dir = "/Library/Input Methods/Squirrel.app/Contents/SharedSupport";
  traits.user_data_dir = argv[1];
  traits.app_name = "rime.lime_latency";
  traits.min_log_level = 3;
  traits.log_dir = "";
  const char* modules[] = {"default", "lua", nullptr};
  traits.modules = modules;
  api->setup(&traits);
  api->initialize(&traits);
  auto id = api->create_session();
  if (!api->select_schema(id, argv[2])) return 2;
  api->set_option(id, "ascii_mode", false);
  for (int round = 0; round < 2; round++) for (int test = 0; test < 3; test++) {
    api->clear_composition(id);
    api->simulate_key_sequence(id, "{Control+Shift+BackSpace}");
    const char* prefix = test == 0 ? "qiche " : test == 1 ? "wo xianzai " : "wo ";
    const char* input = test < 2 ? "youxiang" : "jintiantianqihenhao";
    for (int part = 0; part < 2; part++) {
      const char* text = part == 0 ? prefix : input;
      for (size_t i = 0; i < std::strlen(text); i++) {
        auto start = Clock::now();
        api->process_key(id, text[i], 0);
        RIME_STRUCT(RimeContext, ctx);
        std::string first;
        if (api->get_context(id, &ctx)) {
          if (ctx.menu.num_candidates) first = ctx.menu.candidates[0].text;
          api->free_context(&ctx);
        }
        const auto ms = std::chrono::duration<double, std::milli>(Clock::now() - start).count();
        std::printf("%d\t%d\t%s\t%.*s\t%.3f\t%s\n", round, test,
                    part == 0 ? "prefix" : "target", int(i + 1), text, ms, first.c_str());
        std::fflush(stdout);
        RIME_STRUCT(RimeCommit, commit);
        if (api->get_commit(id, &commit)) api->free_commit(&commit);
        if (gap_ms) std::this_thread::sleep_for(std::chrono::milliseconds(gap_ms));
      }
    }
  }
  api->destroy_session(id);
  api->finalize();
}
