// GPL-3.0. Exercise the installed Rime engine and Lua plugin in a scratch profile.
#include <rime_api.h>
#include <dlfcn.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

int main(int argc, char** argv) {
  if (argc < 3) return 2;
  if (!dlopen(argv[2], RTLD_NOW | RTLD_GLOBAL)) {
    fprintf(stderr, "%s\n", dlerror()); return 2;
  }
  auto* api = rime_get_api();
  RIME_STRUCT(RimeTraits, traits);
  traits.shared_data_dir = "/Library/Input Methods/Squirrel.app/Contents/SharedSupport";
  traits.user_data_dir = argv[1];
  traits.app_name = "rime.lime_jev_smoke";
  traits.log_dir = "";
  traits.min_log_level = 2;
  const char* modules[] = {"default", "lua", nullptr};
  traits.modules = modules;
  api->setup(&traits);
  api->initialize(&traits);
  const auto id = api->create_session();
  if (!api->select_schema(id, "lime_jev")) return 3;
  api->set_option(id, "ascii_mode", false);
  auto input = [&](const char* keys) {
    api->simulate_key_sequence(id, keys);
    RIME_STRUCT(RimeContext, ctx);
    std::string first;
    if (api->get_context(id, &ctx)) {
      if (ctx.menu.num_candidates) first = ctx.menu.candidates[0].text;
      printf("%s -> %s\n", keys, first.c_str());
      api->free_context(&ctx);
    }
    return first;
  };
  auto commit = [&](const char* expected) {
    api->process_key(id, ' ', 0);
    RIME_STRUCT(RimeCommit, c);
    if (!api->get_commit(id, &c)) return false;
    const bool ok = !strcmp(c.text, expected);
    printf("commit: %s\n", c.text);
    api->free_commit(&c);
    return ok;
  };
  if (argc > 3 && !strcmp(argv[3], "--fallback")) {
    if (input("qiche").empty()) return 4;
    puts("PASS: Rime dictionary remains available without the service");
  } else {
    api->simulate_key_sequence(id, "{Control+Shift+BackSpace}");
    if (input("qiche") != "汽车" || !commit("汽车")) return 5;
    if (input("youxiang") != "油箱" || !commit("油箱")) return 6;
    api->simulate_key_sequence(id, "{Control+Shift+BackSpace}");
    if (input("wo") != "我" || !commit("我")) return 7;
    if (input("xianzai") != "现在" || !commit("现在")) return 8;
    if (input("youxiang") != "又想" || !commit("又想")) return 9;
    puts("PASS: real Rime + Lua + HTTP + model + committed prefix");
  }
  api->destroy_session(id);
  api->finalize();
}
