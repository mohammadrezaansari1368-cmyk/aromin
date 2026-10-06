# Bklit chart sources

Installed from the official source registry and pinned to the commit in source.json. The existing project uses Tailwind 3 and React 19. Local adaptations preserve Aromin theme variables, RTL tooltip content and Jalali date formatting. Brush types use the public Visx 4 exports; the loading label uses the installed relative path. The existing cn utility is reused.

C4 uses ChartBrushLayout, LineChart, ChartBrush, Background, XAxis and ChartTooltip. Visx dependencies are pinned together to the React 19 compatible version. Review these local adaptations when updating upstream sources. MIT license is included here and in the deployment package.
