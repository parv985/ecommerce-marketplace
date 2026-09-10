import { createTheme } from '@mui/material/styles'

/*
 * Material UI theme for the Super Admin Audit Log page, mapped onto the
 * existing NexCart design tokens (see frontend/src/index.css) so MUI
 * controls blend into the panel instead of looking like a stock
 * Material app.
 *
 * The provider is scoped to the audit page only — no CssBaseline is
 * installed, so nothing outside this page is restyled. Colors are hard
 * hex values (mirroring the CSS variables) because MUI computes hover/
 * selected shades from them and cannot arithmetic on `var()` strings.
 */
export const auditTheme = createTheme({
  typography: {
    fontFamily:
      "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },

  palette: {
    mode: 'light',
    primary: {
      main: '#b83e20', // var(--primary)
      dark: '#9c3217', // var(--primary-hover)
      contrastText: '#ffffff',
    },
    error: { main: '#b91c1c' }, // var(--destructive)
    warning: { main: '#b45309' }, // var(--warning)
    success: { main: '#15803d' }, // var(--success)
    text: {
      primary: '#191816', // var(--fg)
      secondary: '#55534e', // var(--fg-secondary)
    },
    divider: '#e5e3dc', // var(--border)
    background: { paper: '#ffffff' },
    action: {
      hover: '#f4f3ef', // var(--accent)
      selected: '#fcf5f2', // var(--primary-subtle)
    },
  },

  shape: { borderRadius: 6 }, // var(--radius)

  components: {
    /* Inputs: match the NexCart Input/Select controls (1px hairline,
       6px radius, terracotta focus ring). */
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#e5e3dc',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#cdc9be',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderWidth: 1,
            borderColor: '#b83e20',
            boxShadow: '0 0 0 1px #b83e20',
          },
          '&.Mui-disabled': {
            backgroundColor: '#f4f3ef',
          },
        },
        input: {
          padding: '8px 12px',
          fontSize: 14,
        },
        sizeSmall: {
          '& .MuiOutlinedInput-input': {
            padding: '6.5px 12px',
          },
        },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: 14,
          color: '#78756f',
          '&.Mui-focused': { color: '#b83e20' },
        },
      },
    },

    /* Selects: NexCart-style field appearance. */
    MuiSelect: {
      styleOverrides: {
        select: {
          paddingTop: 8,
          paddingBottom: 8,
        },
        icon: {
          color: '#78756f',
        },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: 14,
          '&.Mui-selected': {
            backgroundColor: '#fcf5f2',
          },
          '&.Mui-selected:hover': {
            backgroundColor: '#f8e8e2',
          },
        },
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
        },
        outlined: {
          borderColor: '#e5e3dc',
          color: '#191816',
          '&:hover': {
            borderColor: '#cdc9be',
            backgroundColor: '#f4f3ef',
          },
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          color: '#78756f',
          '&:hover': {
            color: '#191816',
            backgroundColor: '#f4f3ef',
          },
        },
      },
    },

    /* Chips double as the active-filter pills. */
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 4, // var(--radius-sm)
          fontSize: 12,
          fontWeight: 500,
        },
        deleteIcon: {
          color: '#78756f',
          '&:hover': { color: '#b91c1c' },
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#191816',
          fontSize: 12,
          fontWeight: 500,
          borderRadius: 4,
          padding: '6px 10px',
        },
      },
    },

    MuiPopover: {
      defaultProps: {
        slotProps: {
          paper: {
            elevation: 12,
            sx: {
              borderRadius: '10px', // var(--radius-lg)
              border: '1px solid #e5e3dc',
              boxShadow: '0 12px 32px rgba(25, 24, 22, 0.09)',
            },
          },
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
})
