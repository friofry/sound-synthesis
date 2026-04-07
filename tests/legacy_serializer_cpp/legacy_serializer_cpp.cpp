#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

struct Line {
  int dot1 = 0;
  int dot2 = 0;
  double k = 0.0;
};

struct Dot {
  int x = 0;
  int y = 0;
  double u = 0.0;
  double v = 0.0;
  double weight = 0.0;
  int fixed = 0;
  std::string inputFile;
  std::vector<Line> lines;
};

struct Graph {
  std::vector<Dot> dots;

  void addDot(int x, int y, double u, double v, double weight, int fixed, const char* inputFile) {
    Dot dot;
    dot.x = x;
    dot.y = y;
    dot.u = u;
    dot.v = v;
    dot.weight = weight;
    dot.fixed = fixed;
    if (inputFile != nullptr) {
      dot.inputFile = inputFile;
    }
    dots.push_back(dot);
  }

  void addLine1(int dot1, int dot2, double k) {
    if (dot1 < 0 || static_cast<size_t>(dot1) >= dots.size()) {
      return;
    }
    dots[dot1].lines.push_back(Line{dot1, dot2, k});
  }
};

template <typename T>
bool readValue(std::ifstream& input, T& value) {
  input.read(reinterpret_cast<char*>(&value), sizeof(T));
  return input.good();
}

bool graphFromFileCpp(Graph& graph, const std::filesystem::path& filePath, std::string& error) {
  std::ifstream input(filePath, std::ios::binary);
  if (!input.is_open()) {
    error = "failed to open file";
    return false;
  }

  int n = 0;
  if (!readValue(input, n)) {
    error = "failed to read dot count";
    return false;
  }
  if (n < 0) {
    error = "negative dot count";
    return false;
  }

  int x = 0;
  int y = 0;
  double weight = 0.0;
  double v = 0.0;
  double u = 0.0;
  int fixed = 0;
  int len = 0;

  for (int i = 0; i < n; ++i) {
    if (!readValue(input, x) || !readValue(input, y) || !readValue(input, weight) || !readValue(input, v) ||
        !readValue(input, u) || !readValue(input, fixed) || !readValue(input, len)) {
      error = "failed while reading dot record " + std::to_string(i);
      return false;
    }
    if (len < 0 || len > 1'000'000) {
      error = "invalid filename length " + std::to_string(len) + " at dot " + std::to_string(i);
      return false;
    }

    std::vector<char> nameBuffer(static_cast<size_t>(len), '\0');
    if (len > 0) {
      input.read(nameBuffer.data(), len);
      if (!input.good()) {
        error = "failed while reading filename for dot " + std::to_string(i);
        return false;
      }
    }

    graph.addDot(x, y, u, v, weight, fixed, nameBuffer.empty() ? "" : nameBuffer.data());
  }

  int k = 0;
  int ni = 0;
  double ki = 0.0;
  for (int i = 0; i < n; ++i) {
    if (!readValue(input, k)) {
      error = "failed while reading adjacency count for dot " + std::to_string(i);
      return false;
    }
    if (k < 0) {
      error = "negative adjacency count " + std::to_string(k) + " at dot " + std::to_string(i);
      return false;
    }

    for (int j = 0; j < k; ++j) {
      if (!readValue(input, ni) || !readValue(input, ki)) {
        error = "failed while reading edge " + std::to_string(j) + " for dot " + std::to_string(i);
        return false;
      }
      graph.addLine1(i, ni, ki);
    }
  }

  return true;
}

std::vector<std::filesystem::path> collectGraphFiles(const std::filesystem::path& root) {
  std::vector<std::filesystem::path> files;
  if (!std::filesystem::exists(root)) {
    return files;
  }
  for (const auto& entry : std::filesystem::recursive_directory_iterator(root)) {
    if (entry.is_regular_file() && entry.path().extension() == ".gph") {
      files.push_back(entry.path());
    }
  }
  return files;
}

int main(int argc, char** argv) {
  const std::filesystem::path root =
      argc > 1 ? std::filesystem::path(argv[1]) : std::filesystem::path("public/graphs");
  const auto files = collectGraphFiles(root);

  if (files.empty()) {
    std::cerr << "No .gph files found under " << root << "\n";
    return 1;
  }

  bool hasFailures = false;
  for (const auto& file : files) {
    Graph graph;
    std::string error;
    const bool ok = graphFromFileCpp(graph, file, error);
    if (!ok) {
      hasFailures = true;
      std::cout << "FAIL " << file.string() << " :: " << error << "\n";
      continue;
    }

    size_t edgeCount = 0;
    size_t inputCount = 0;
    for (const auto& dot : graph.dots) {
      edgeCount += dot.lines.size();
      if (!dot.inputFile.empty()) {
        ++inputCount;
      }
    }

    std::cout << "OK " << file.string() << " :: dots=" << graph.dots.size() << " directed_edges=" << edgeCount
              << " input_files=" << inputCount << "\n";
  }

  return hasFailures ? 2 : 0;
}
