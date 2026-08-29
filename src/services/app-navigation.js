export const APP_NAVIGATION = [
  {
    label: "홈",
    path: "/app",
    description: "운영 홈으로 이동합니다.",
  },
  {
    label: "글 작성",
    path: "/app/write",
    description: "게시글을 작성하거나 AI 초안을 만듭니다.",
  },
  {
    label: "미디어",
    path: "/app/media",
    description: "사진과 동영상을 업로드하고 관리합니다.",
  },
  {
    label: "제품",
    path: "/app/products",
    description: "제품 정보와 게시 맥락을 관리합니다.",
  },
  {
    label: "프롬프트",
    path: "/app/prompts",
    description: "AI가 글을 작성하는 방식을 설정합니다.",
  },
  {
    label: "운영 활동",
    path: "/app/activity",
    description: "최근 자동 실행과 게시 활동을 확인합니다.",
  },
  {
    label: "자동 게시",
    path: "/app/schedules",
    description: "자동 게시 일정과 상태를 관리합니다.",
  },
  {
    label: "앱 연결",
    path: "/app/apps",
    description: "Threads와 외부 게시 채널을 연결합니다.",
  },
];

export function getAppNavigationItem(path) {
  return APP_NAVIGATION.find((item) => item.path === path) || null;
}
